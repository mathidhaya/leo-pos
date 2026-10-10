import { z } from "zod";
import { isValidYmd } from "../utils/dateRange";
import { normalizePhone } from "../utils/phone";
import { quoteSchema } from "./pos.validators";

export const createOrderSchema = quoteSchema
  .extend({
    // A new key for every "Place order" press. The same key twice returns the first order.
    idempotencyKey: z.string().uuid("Invalid request key."),
    // The total the cashier confirmed. If prices changed since, the server refuses.
    expectedTotal: z.string().regex(/^\d{1,12}\.\d{2}$/, "Invalid total."),
    tableNo: z.string().trim().max(20, "Table number is too long.").optional(),
    guests: z
      .number()
      .int("Number of people must be a whole number.")
      .min(1, "Number of people must be at least 1.")
      .max(99, "Number of people is too large.")
      .nullable()
      .optional(),
    customerName: z.string().trim().max(80, "Name is too long.").optional(),
    customerPhone: z.string().trim().max(20, "Phone number is too long.").optional(),
    address: z.string().trim().max(300, "Address is too long.").optional(),
  })
  .superRefine((order, ctx) => {
    const name = order.customerName ?? "";
    const phone = order.customerPhone ?? "";
    const address = order.address ?? "";

    if (order.orderType === "TAKE_AWAY" && phone && !normalizePhone(phone)) {
      ctx.addIssue({ code: "custom", path: ["customerPhone"], message: "Enter a valid 10-digit mobile number." });
    }

    if (order.orderType === "DELIVERY") {
      if (name.length < 2) {
        ctx.addIssue({ code: "custom", path: ["customerName"], message: "Enter the customer's name." });
      }
      if (!normalizePhone(phone)) {
        ctx.addIssue({ code: "custom", path: ["customerPhone"], message: "Enter a valid 10-digit mobile number." });
      }
      if (address.length < 5) {
        ctx.addIssue({ code: "custom", path: ["address"], message: "Enter the delivery address." });
      }
    }
  });

export const updateStatusSchema = z.object({
  status: z.enum(["PENDING", "PREPARING", "READY", "COMPLETED", "CANCELLED"]),
});

const dateField = z.string().refine(isValidYmd, "Use the date format YYYY-MM-DD.");

export const listOrdersQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    from: dateField.optional(),
    to: dateField.optional(),
    status: z.enum(["all", "PENDING", "PREPARING", "READY", "COMPLETED", "CANCELLED"]).default("all"),
    orderType: z.enum(["all", "DINE_IN", "TAKE_AWAY", "DELIVERY"]).default("all"),
    payment: z.enum(["all", "UNPAID", "CASH", "UPI", "CARD", "OTHER"]).default("all"),
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

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
