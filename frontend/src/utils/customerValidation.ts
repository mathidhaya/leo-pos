import { z } from "zod";
import { isValidPhone } from "./phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const customerFormSchema = z.object({
  name: z.string().trim().min(2, "Enter the customer's name.").max(80, "Name is too long (80 characters max)."),
  phone: z.string().trim().min(1, "Enter the mobile number.").refine(isValidPhone, "Enter a valid 10-digit mobile number."),
  email: z
    .string()
    .trim()
    .max(254, "Email is too long.")
    .refine((value) => value === "" || EMAIL_RE.test(value), "Enter a valid email address."),
  address: z.string().trim().max(300, "Address is too long (300 characters max)."),
});
export type CustomerFormValues = z.infer<typeof customerFormSchema>;
