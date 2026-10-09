import { z } from "zod";
import { isValidIdentifier } from "./identifier";

const identifierField = z
  .string()
  .trim()
  .min(1, "Enter your mobile number or email.")
  .refine(isValidIdentifier, "Enter a valid mobile number or email.");

const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password is too long.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/\d/, "Include at least one number.");

export const identifierFormSchema = z.object({ identifier: identifierField });
export type IdentifierForm = z.infer<typeof identifierFormSchema>;

export const loginFormSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your mobile number or email."),
  password: z.string().min(1, "Enter your password."),
});
export type LoginForm = z.infer<typeof loginFormSchema>;

export const registerDetailsSchema = z
  .object({
    ownerName: z.string().trim().min(2, "Enter the owner's name.").max(80, "Name is too long."),
    shopName: z.string().trim().min(2, "Enter your cafe name.").max(100, "Name is too long."),
    password: passwordField,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
export type RegisterDetailsForm = z.infer<typeof registerDetailsSchema>;

export const newPasswordSchema = z
  .object({
    newPassword: passwordField,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
export type NewPasswordForm = z.infer<typeof newPasswordSchema>;
