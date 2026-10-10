import { z } from "zod";
import { MAX_LINES, MAX_QUANTITY } from "../utils/billing";

export const quoteSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid("Invalid product."),
        quantity: z
          .number()
          .int("Quantity must be a whole number.")
          .min(1, "Quantity must be at least 1.")
          .max(MAX_QUANTITY, `Quantity cannot be more than ${MAX_QUANTITY}.`),
      })
    )
    .min(1, "Add at least one item.")
    .max(MAX_LINES, `An order can have at most ${MAX_LINES} different items.`),
  discount: z.discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({ type: z.literal("percent"), value: z.string().trim().max(12) }),
    z.object({ type: z.literal("amount"), value: z.string().trim().max(12) }),
  ]),
  orderType: z.enum(["DINE_IN", "TAKE_AWAY", "DELIVERY"]),
  deliveryCharge: z.string().trim().max(12).optional(),
});

export type QuoteInput = z.infer<typeof quoteSchema>;
