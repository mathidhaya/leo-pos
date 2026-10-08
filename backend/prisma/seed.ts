import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing in .env");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// [sku, name, category, selling price, cost price, prep minutes, opening stock]
const PRODUCTS: Array<[string, string, string, string, string, number, number]> = [
  ["COF-001", "Cappuccino", "Coffee", "150.00", "45.00", 5, 60],
  ["COF-002", "Espresso", "Coffee", "110.00", "30.00", 3, 60],
  ["COF-003", "Latte", "Coffee", "160.00", "50.00", 5, 60],
  ["COF-004", "Cold Coffee", "Coffee", "170.00", "55.00", 5, 50],
  ["TEA-001", "Masala Tea", "Tea", "60.00", "15.00", 4, 100],
  ["TEA-002", "Green Tea", "Tea", "80.00", "20.00", 3, 80],
  ["FF-001", "Veg Sandwich", "Fast Food", "120.00", "40.00", 8, 40],
  ["FF-002", "Chicken Sandwich", "Fast Food", "160.00", "60.00", 10, 8], // low stock on purpose
  ["FF-003", "Burger", "Fast Food", "150.00", "55.00", 10, 30],
  ["SNK-001", "French Fries", "Snacks", "110.00", "35.00", 7, 40],
  ["SNK-002", "Samosa", "Snacks", "40.00", "12.00", 3, 50],
  ["BEV-001", "Fresh Juice", "Beverages", "120.00", "40.00", 4, 30],
  ["BEV-002", "Milkshake", "Beverages", "160.00", "55.00", 5, 30],
  ["DES-001", "Chocolate Brownie", "Desserts", "120.00", "40.00", 2, 25],
];

const CATEGORIES = ["Coffee", "Tea", "Fast Food", "Beverages", "Snacks", "Desserts"];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run the development seed in production.");
  }

  const email = process.env.SEED_OWNER_EMAIL;
  const phone = process.env.SEED_OWNER_PHONE ?? null;
  const password = process.env.SEED_OWNER_PASSWORD;

  if (!email || !password) {
    throw new Error("Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD in backend/.env first.");
  }
  if (password.length < 8) {
    throw new Error("SEED_OWNER_PASSWORD must be at least 8 characters.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Seed data already exists. Nothing to do.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction(
    async (tx) => {
      const shop = await tx.shop.create({
        data: {
          name: "Leo Cafe",
          address: "Sample address, update in Settings",
          phone,
          email,
          settings: { create: {} },
        },
      });

      const owner = await tx.user.create({
        data: {
          shopId: shop.id,
          name: "Owner",
          email,
          phone,
          passwordHash,
          role: "OWNER",
          staff: { create: {} },
        },
      });

      const categoryIds: Record<string, string> = {};
      for (const name of CATEGORIES) {
        const category = await tx.category.create({ data: { shopId: shop.id, name } });
        categoryIds[name] = category.id;
      }

      for (const [sku, name, category, price, cost, prep, stock] of PRODUCTS) {
        const product = await tx.product.create({
          data: {
            shopId: shop.id,
            categoryId: categoryIds[category],
            sku,
            name,
            sellingPrice: price,
            costPrice: cost,
            gstPercent: "5.00",
            prepTimeMin: prep,
            inventory: { create: { quantity: stock, minStock: 10 } },
          },
        });

        await tx.inventoryTransaction.create({
          data: {
            productId: product.id,
            type: "IN",
            quantityChange: stock,
            reason: "Opening stock",
            userId: owner.id,
          },
        });
      }

      console.log(`Created shop "${shop.name}", 1 owner, ${CATEGORIES.length} categories, ${PRODUCTS.length} products.`);
      console.log(`Owner login email: ${email}`);
    },
    { timeout: 30000 }
  );
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
