import "dotenv/config";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing in .env");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const ACCOUNTS = [
  { name: "Test Manager", email: "manager@leopos.local", phone: "9000000001", role: "MANAGER" },
  { name: "Test Cashier", email: "cashier@leopos.local", phone: "9000000002", role: "CASHIER" },
] as const;

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Test accounts are for development only.");
  }

  const ownerEmail = process.env.SEED_OWNER_EMAIL;
  if (!ownerEmail) throw new Error("SEED_OWNER_EMAIL is missing in backend/.env");
  const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!owner) throw new Error("Owner account not found. Run npm run db:seed first.");

  for (const account of ACCOUNTS) {
    const existing = await prisma.user.findUnique({ where: { email: account.email } });
    if (existing) {
      console.log(`${account.email} already exists (password not shown again).`);
      continue;
    }

    const password = crypto.randomBytes(9).toString("base64url");
    await prisma.user.create({
      data: {
        shopId: owner.shopId,
        name: account.name,
        email: account.email,
        phone: account.phone,
        passwordHash: await bcrypt.hash(password, 12),
        role: account.role,
        staff: { create: {} },
      },
    });
    console.log(`${account.role}: ${account.email}   password: ${password}`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
