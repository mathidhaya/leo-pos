import { z } from "zod";
import { isValidYmd } from "../utils/dateRange";

export const createPaymentSchema = z.object({
  orderId: z.string().uuid("Invalid order."),
  method: z.enum(["CASH", "UPI", "CARD", "OTHER"]),
  // Only used for cash
  amountReceived: z.string().trim().max(12).optional(),
  // A new key for every payment dialog. The same key twice returns the first payment.
  idempotencyKey: z.string().uuid("Invalid request key."),
});

const dateField = z.string().refine(isValidYmd, "Use the date format YYYY-MM-DD.");

export const listPaymentsQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    from: dateField.optional(),
    to: dateField.optional(),
    method: z.enum(["all", "CASH", "UPI", "CARD", "OTHER"]).default("all"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((query, ctx) => {
    if (Boolean(query.from) !== Boolean(query.to)) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "Choose both a start and an end date." });
    } else if (query.from && query.to && query.from > query.to) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "The start date must not be after the end date." });
    }
  });

export const listInvoicesQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    from: dateField.optional(),
    to: dateField.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((query, ctx) => {
    if (Boolean(query.from) !== Boolean(query.to)) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "Choose both a start and an end date." });
    } else if (query.from && query.to && query.from > query.to) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "The start date must not be after the end date." });
    }
  });

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
