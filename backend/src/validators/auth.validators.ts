import { z } from "zod";
import { parseIdentifier } from "../utils/identifier";

const identifierField = z
  .string()
  .trim()
  .refine((value) => parseIdentifier(value) !== null, "Please enter a valid mobile number or email.");

const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password is too long.")
  .regex(/[A-Za-z]/, "Password must contain a letter.")
  .regex(/\d/, "Password must contain a number.");

const otpField = z.string().trim().regex(/^\d{4}$/, "Enter the 4-digit OTP.");

const purposeField = z.enum(["REGISTER", "RESET"]);

export const sendOtpSchema = z.object({
  identifier: identifierField,
  purpose: purposeField,
});

export const verifyOtpSchema = z.object({
  identifier: identifierField,
  purpose: purposeField,
  otp: otpField,
});

export const registerSchema = z
  .object({
    identifier: identifierField,
    ownerName: z.string().trim().min(2, "Owner name is required.").max(80, "Owner name is too long."),
    shopName: z.string().trim().min(2, "Cafe name is required.").max(100, "Cafe name is too long."),
    password: passwordField,
    confirmPassword: z.string().min(1, "Please confirm your password."),
    verificationId: z.string().uuid("Please verify your OTP first."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your mobile number or email.").max(254),
  password: z.string().min(1, "Enter your password.").max(200),
});

export const forgotPasswordSchema = z.object({
  identifier: identifierField,
});

export const resetPasswordSchema = z
  .object({
    identifier: identifierField,
    verificationId: z.string().uuid("Please verify your OTP first."),
    newPassword: passwordField,
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
