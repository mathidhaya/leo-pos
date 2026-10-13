import { z } from "zod";
import { isValidPhone } from "./phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN_RE = /^(0[1-9]|[12][0-9]|3[0-8]|9[79])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GST_MESSAGE = "Enter a valid 15-character GST number, for example 22AAAAA0000A1Z5.";

const digitsOf = (value: string) => value.replace(/\D/g, "");

const emailField = z
  .string()
  .trim()
  .max(254, "Email is too long.")
  .refine((value) => value === "" || EMAIL_RE.test(value), "Enter a valid email address.");

const percentField = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, `${label} must be a number between 0 and 100 (up to 2 decimals).`)
    .refine((value) => !(Number(value) > 100), `${label} must be between 0 and 100.`);

export const shopFormSchema = z.object({
  name: z.string().trim().min(2, "Enter the cafe name.").max(100, "Name is too long (100 characters max)."),
  address: z.string().trim().max(300, "Address is too long (300 characters max)."),
  phone: z
    .string()
    .trim()
    .max(20, "Phone number is too long.")
    .refine(
      (value) =>
        value === "" ||
        (/^[0-9+()\-\s]+$/.test(value) && digitsOf(value).length >= 6 && digitsOf(value).length <= 15),
      "Enter a valid phone number (digits, spaces, + - and brackets)."
    ),
  email: emailField,
  gstNumber: z
    .string()
    .trim()
    .max(15, GST_MESSAGE)
    .refine((value) => value === "" || GSTIN_RE.test(value.toUpperCase()), GST_MESSAGE),
});
export type ShopFormValues = z.infer<typeof shopFormSchema>;

export const billingFormSchema = z.object({
  invoicePrefix: z
    .string()
    .trim()
    .refine((value) => /^[A-Z0-9]{1,6}$/.test(value.toUpperCase()), "Use 1 to 6 letters or numbers, for example LC."),
  defaultGst: percentField("Default GST"),
  defaultDiscount: percentField("Default discount"),
});
export type BillingFormValues = z.infer<typeof billingFormSchema>;

export const receiptFormSchema = z.object({
  receiptFooter: z.string().trim().min(1, "Enter a footer message.").max(120, "The footer is too long (120 characters max)."),
  printerName: z.string().trim().max(60, "The printer name is too long (60 characters max)."),
  showGst: z.boolean(),
  showCashier: z.boolean(),
});
export type ReceiptFormValues = z.infer<typeof receiptFormSchema>;

export const profileFormSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name.").max(80, "Name is too long (80 characters max)."),
    phone: z
      .string()
      .trim()
      .max(20, "Phone number is too long.")
      .refine((value) => value === "" || isValidPhone(value), "Enter a valid 10-digit mobile number."),
    email: emailField,
    currentPassword: z.string().max(200, "Password is too long."),
  })
  .superRefine((value, ctx) => {
    if (value.phone === "" && value.email === "") {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Keep at least a mobile number or an email to log in with.",
      });
    }
  });
export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(200, "Password is too long."),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(72, "Password is too long.")
      .regex(/[A-Za-z]/, "Include at least one letter.")
      .regex(/\d/, "Include at least one number."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match." });
    } else if (value.newPassword === value.currentPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "The new password must be different from the current one.",
      });
    }
  });
export type PasswordFormValues = z.infer<typeof passwordFormSchema>;
