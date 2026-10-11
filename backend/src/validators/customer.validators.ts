import { z } from "zod";
import { normalizePhone } from "../utils/phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Used for both adding and editing a customer.
// The output is clean: the phone is 10 plain digits, an empty email or address becomes null.
export const customerBodySchema = z.object({
  name: z.string().trim().min(2, "Enter the customer's name.").max(80, "Name is too long (80 characters max)."),
  phone: z
    .string()
    .trim()
    .min(1, "Enter the mobile number.")
    .max(20, "Phone number is too long.")
    .refine((value) => normalizePhone(value) !== null, "Enter a valid 10-digit mobile number.")
    .transform((value) => normalizePhone(value) as string),
  email: z
    .string()
    .trim()
    .max(254, "Email is too long.")
    .refine((value) => value === "" || EMAIL_RE.test(value), "Enter a valid email address.")
    .optional()
    .transform((value) => (value ? value.toLowerCase() : null)),
  address: z
    .string()
    .trim()
    .max(300, "Address is too long (300 characters max).")
    .optional()
    .transform((value) => (value ? value : null)),
});

export const listCustomersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["name", "recent", "orders", "spent", "newest"]).default("name"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const customerOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export type CustomerInput = z.infer<typeof customerBodySchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CustomerOrdersQuery = z.infer<typeof customerOrdersQuerySchema>;
