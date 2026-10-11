import { z } from "zod";
import { isValidYmd, resolveRange } from "../utils/dateRange";
import { normalizePhone } from "../utils/phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_JOINING_DATE = "2000-01-01";

// The latest joining date allowed: one year from today (India time). New hires may start in the future.
export function latestJoiningDate(): string {
  const today = resolveRange({ range: "today" }).from;
  return new Date(Date.parse(today) + 365 * 86_400_000).toISOString().slice(0, 10);
}

// Used for both adding and editing staff. The output is clean: the phone is 10 plain digits,
// an empty email becomes null. The owner role cannot be given here.
export const staffBodySchema = z.object({
  name: z.string().trim().min(2, "Enter the staff member's name.").max(80, "Name is too long (80 characters max)."),
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
  role: z.enum(["MANAGER", "CASHIER"]),
  joiningDate: z
    .string()
    .refine(isValidYmd, "Enter a valid joining date.")
    .refine((value) => value >= MIN_JOINING_DATE && value <= latestJoiningDate(), "The joining date is out of range."),
});

export const staffStatusSchema = z.object({ isActive: z.boolean() });

export const listStaffQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(["all", "OWNER", "MANAGER", "CASHIER"]).default("all"),
  status: z.enum(["all", "active", "disabled"]).default("all"),
});

export type StaffInput = z.infer<typeof staffBodySchema>;
export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;
