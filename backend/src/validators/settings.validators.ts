import { z } from "zod";
import { isUploadUrl } from "../config/uploads";
import { normalizePhone } from "../utils/phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// An Indian GST number: 2-digit state code, 10-character PAN, entity number, "Z", and a check character
const GSTIN_RE = /^(0[1-9]|[12][0-9]|3[0-8]|9[79])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GST_MESSAGE = "Enter a valid 15-character GST number, for example 22AAAAA0000A1Z5.";

const digitsOf = (value: string) => value.replace(/\D/g, "");

const emailField = z
  .string()
  .trim()
  .max(254, "Email is too long.")
  .refine((value) => value === "" || EMAIL_RE.test(value), "Enter a valid email address.")
  .optional()
  .transform((value) => (value ? value.toLowerCase() : null));

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value ? value : null));

// undefined = leave the logo as it is, null = remove it
const logoField = z.string().refine(isUploadUrl, "Please upload the logo again.").nullable().optional();

// A cafe phone can be a landline, so it is not limited to mobile numbers
const cafePhoneField = z
  .string()
  .trim()
  .max(20, "Phone number is too long.")
  .refine(
    (value) =>
      value === "" ||
      (/^[0-9+()\-\s]+$/.test(value) && digitsOf(value).length >= 6 && digitsOf(value).length <= 15),
    "Enter a valid phone number (digits, spaces, + - and brackets)."
  )
  .optional()
  .transform((value) => (value ? value : null));

const percentField = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .pipe(
      z
        .string()
        .regex(/^\d{1,3}(\.\d{1,2})?$/, `${label} must be a number between 0 and 100 (up to 2 decimals).`)
        .refine((value) => !(Number(value) > 100), `${label} must be between 0 and 100.`)
    );

// ---------- cafe, billing, receipt ----------

export const shopSchema = z.object({
  name: z.string().trim().min(2, "Enter the cafe name.").max(100, "Name is too long (100 characters max)."),
  address: optionalText(300, "Address is too long (300 characters max)."),
  phone: cafePhoneField,
  email: emailField,
  gstNumber: z
    .string()
    .trim()
    .max(15, GST_MESSAGE)
    .transform((value) => value.toUpperCase())
    .refine((value) => value === "" || GSTIN_RE.test(value), GST_MESSAGE)
    .optional()
    .transform((value) => (value ? value : null)),
  logoUrl: logoField,
});

export const billingSchema = z.object({
  invoicePrefix: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{1,6}$/, "Use 1 to 6 letters or numbers, for example LC.")),
  defaultGst: percentField("Default GST"),
  defaultDiscount: percentField("Default discount"),
});

export const receiptSchema = z.object({
  receiptFooter: z.string().trim().min(1, "Enter a footer message.").max(120, "The footer is too long (120 characters max)."),
  printerName: optionalText(60, "The printer name is too long (60 characters max)."),
  showGst: z.boolean(),
  showCashier: z.boolean(),
});

// ---------- the signed-in person's own account ----------

export const accountProfileSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name.").max(80, "Name is too long (80 characters max)."),
    phone: z
      .string()
      .trim()
      .max(20, "Phone number is too long.")
      .refine((value) => value === "" || normalizePhone(value) !== null, "Enter a valid 10-digit mobile number.")
      .optional()
      .transform((value) => (value ? (normalizePhone(value) as string) : null)),
    email: emailField,
    currentPassword: z.string().max(200, "Password is too long.").optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.phone && !value.email) {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Keep at least a mobile number or an email to log in with.",
      });
    }
  });

const newPasswordField = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password is too long.")
  .regex(/[A-Za-z]/, "Password must contain a letter.")
  .regex(/\d/, "Password must contain a number.");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(200, "Password is too long."),
    newPassword: newPasswordField,
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

export type ShopInput = z.infer<typeof shopSchema>;
export type BillingInput = z.infer<typeof billingSchema>;
export type ReceiptInput = z.infer<typeof receiptSchema>;
export type ProfileInput = z.infer<typeof accountProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
