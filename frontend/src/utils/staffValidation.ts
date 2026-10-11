import { z } from "zod";
import { toYmd } from "./format";
import { isValidPhone } from "./phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const JOINING_MIN = "2000-01-01";

// One year from today. The server checks this again, using India time.
export function latestJoining(): string {
  return toYmd(new Date(Date.now() + 365 * 86_400_000));
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export const staffFormSchema = z.object({
  name: z.string().trim().min(2, "Enter the staff member's name.").max(80, "Name is too long (80 characters max)."),
  phone: z.string().trim().min(1, "Enter the mobile number.").refine(isValidPhone, "Enter a valid 10-digit mobile number."),
  email: z
    .string()
    .trim()
    .max(254, "Email is too long.")
    .refine((value) => value === "" || EMAIL_RE.test(value), "Enter a valid email address."),
  role: z.string().refine((value) => value === "MANAGER" || value === "CASHIER", "Choose a role."),
  joiningDate: z
    .string()
    .refine(isRealDate, "Enter a valid joining date.")
    .refine((value) => value >= JOINING_MIN && value <= latestJoining(), "The joining date is out of range."),
});
export type StaffFormValues = z.infer<typeof staffFormSchema>;
