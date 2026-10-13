import { prisma } from "../config/db";
import type { RoleName } from "../types/auth";
import { AppError } from "../utils/AppError";
import { changedFields } from "../utils/changedFields";
import type { BillingInput, ReceiptInput, ShopInput } from "../validators/settings.validators";
import { logAudit, type RequestContext } from "./audit.service";
import { deleteUploadedImage } from "./upload.service";

type Actor = { id: string; shopId: string; role: RoleName };

const shopSelect = { name: true, address: true, phone: true, email: true, gstNumber: true, logoUrl: true } as const;

// Every cafe should have a settings row. If an old one is missing, it is created with the defaults.
const ensureSettings = (shopId: string) =>
  prisma.settings.upsert({ where: { shopId }, update: {}, create: { shopId } });

const shopNotFound = () => new AppError(404, "SHOP_NOT_FOUND", "Cafe not found.");

// ---------- reading ----------

// Everything the settings page needs (owner only)
export async function getSettings(user: Actor) {
  const [shop, settings] = await Promise.all([
    prisma.shop.findUnique({ where: { id: user.shopId }, select: shopSelect }),
    ensureSettings(user.shopId),
  ]);
  if (!shop) throw shopNotFound();

  return {
    shop,
    billing: {
      invoicePrefix: settings.invoicePrefix,
      defaultGst: settings.defaultGst.toFixed(2),
      defaultDiscount: settings.defaultDiscount.toFixed(2),
      currency: settings.currency,
      // Read-only: the numbers the next order and invoice will get
      nextInvoiceNumber: settings.nextInvoiceNumber,
      nextOrderNumber: settings.nextOrderNumber,
    },
    receipt: {
      receiptFooter: settings.receiptFooter,
      printerName: settings.printerName,
      showGst: settings.showGst,
      showCashier: settings.showCashier,
    },
  };
}

// What every screen needs, for every role: the cafe's name and logo, the defaults, and the
// signed-in person's own name. Nothing sensitive (no GST number, no address, no counters).
export async function getAppSettings(user: Actor) {
  const [shop, settings, me] = await Promise.all([
    prisma.shop.findUnique({ where: { id: user.shopId }, select: { name: true, logoUrl: true } }),
    ensureSettings(user.shopId),
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true } }),
  ]);
  if (!shop) throw shopNotFound();

  return {
    shopName: shop.name,
    logoUrl: shop.logoUrl,
    currency: settings.currency,
    defaultGst: settings.defaultGst.toFixed(2),
    defaultDiscount: settings.defaultDiscount.toFixed(2),
    printerName: settings.printerName,
    userName: me?.name ?? "",
  };
}

// ---------- writing ----------
// Only the fields on each page are written. The invoice and order counters are never touched here,
// so saving settings can never disturb a sale that is happening at the same moment.

export async function updateShop(user: Actor, input: ShopInput, ctx: RequestContext) {
  const before = await prisma.shop.findUnique({ where: { id: user.shopId }, select: shopSelect });
  if (!before) throw shopNotFound();

  const data = {
    name: input.name,
    address: input.address,
    phone: input.phone,
    email: input.email,
    gstNumber: input.gstNumber,
    ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
  };

  const changed = changedFields(before, data);
  if (changed.length > 0) {
    await prisma.shop.update({ where: { id: user.shopId }, data });

    // The old logo file is no longer needed
    if (data.logoUrl !== undefined && before.logoUrl && before.logoUrl !== data.logoUrl) {
      await deleteUploadedImage(before.logoUrl);
    }

    await logAudit(
      {
        shopId: user.shopId,
        userId: user.id,
        action: "SETTINGS_CHANGED",
        entity: "shop",
        entityId: user.shopId,
        details: { section: "cafe", changed: changed.join(", ") },
      },
      ctx
    );
  }

  return getSettings(user);
}

export async function updateBilling(user: Actor, input: BillingInput, ctx: RequestContext) {
  const before = await ensureSettings(user.shopId);

  const data = {
    invoicePrefix: input.invoicePrefix,
    // "5" and "5.00" are the same number, so both are written the same way
    defaultGst: Number(input.defaultGst).toFixed(2),
    defaultDiscount: Number(input.defaultDiscount).toFixed(2),
  };
  const current = {
    invoicePrefix: before.invoicePrefix,
    defaultGst: before.defaultGst.toFixed(2),
    defaultDiscount: before.defaultDiscount.toFixed(2),
  };

  const changed = changedFields(current, data);
  if (changed.length > 0) {
    await prisma.settings.update({ where: { shopId: user.shopId }, data });
    await logAudit(
      {
        shopId: user.shopId,
        userId: user.id,
        action: "SETTINGS_CHANGED",
        entity: "settings",
        entityId: before.id,
        details: { section: "billing", changed: changed.join(", ") },
      },
      ctx
    );
  }

  return getSettings(user);
}

export async function updateReceipt(user: Actor, input: ReceiptInput, ctx: RequestContext) {
  const before = await ensureSettings(user.shopId);

  const data = {
    receiptFooter: input.receiptFooter,
    printerName: input.printerName,
    showGst: input.showGst,
    showCashier: input.showCashier,
  };

  const changed = changedFields(before, data);
  if (changed.length > 0) {
    await prisma.settings.update({ where: { shopId: user.shopId }, data });
    await logAudit(
      {
        shopId: user.shopId,
        userId: user.id,
        action: "SETTINGS_CHANGED",
        entity: "settings",
        entityId: before.id,
        details: { section: "receipt", changed: changed.join(", ") },
      },
      ctx
    );
  }

  return getSettings(user);
}
