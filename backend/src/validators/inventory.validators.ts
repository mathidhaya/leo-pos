import { z } from "zod";
import { isValidYmd } from "../utils/dateRange";
import { MAX_STOCK } from "../utils/stockStatus";

const productId = z.string().uuid("Invalid product.");
const idempotencyKey = z.string().uuid("Invalid request key.");

const quantity = z
  .number()
  .int("Quantity must be a whole number.")
  .min(1, "Quantity must be at least 1.")
  .max(MAX_STOCK, "Quantity is too large.");

const optionalReason = z.string().trim().max(200, "The reason is too long (200 characters max).");
const requiredReason = z
  .string()
  .trim()
  .min(3, "Please give a reason (at least 3 characters).")
  .max(200, "The reason is too long (200 characters max).");

export const adjustSchema = z.discriminatedUnion("action", [
  // Add stock. The reason is optional.
  z.object({
    action: z.literal("IN"),
    productId,
    quantity,
    reason: optionalReason.optional(),
    idempotencyKey,
  }),
  // Remove stock (wastage, damage, expiry). A reason is required.
  z.object({
    action: z.literal("OUT"),
    productId,
    quantity,
    reason: requiredReason,
    idempotencyKey,
  }),
  // Set the exact counted number. `expectedQuantity` is the number the screen showed when counting started.
  z.object({
    action: z.literal("ADJUST"),
    productId,
    newQuantity: z.number().int("The count must be a whole number.").min(0, "The count cannot be negative.").max(MAX_STOCK, "The count is too large."),
    expectedQuantity: z.number().int().min(0).max(MAX_STOCK),
    reason: requiredReason,
    idempotencyKey,
  }),
]);

const dateField = z.string().refine(isValidYmd, "Use the date format YYYY-MM-DD.");

function checkDates(query: { from?: string; to?: string }, ctx: z.RefinementCtx) {
  if (Boolean(query.from) !== Boolean(query.to)) {
    ctx.addIssue({ code: "custom", path: ["from"], message: "Choose both a start and an end date." });
  } else if (query.from && query.to && query.from > query.to) {
    ctx.addIssue({ code: "custom", path: ["from"], message: "The start date must not be after the end date." });
  }
}

export const listInventoryQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  stock: z.enum(["all", "low", "out"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listMovementsQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    productId: z.string().uuid().optional(),
    type: z.enum(["all", "IN", "OUT", "ADJUST", "SALE"]).default("all"),
    from: dateField.optional(),
    to: dateField.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine(checkDates);

export type AdjustInput = z.infer<typeof adjustSchema>;
export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;
