import type { OtpPurpose, Session } from "../types/auth";
import { api } from "./client";

interface Envelope<T> {
  success: boolean;
  data: T;
}

export interface RegisterPayload {
  identifier: string;
  ownerName: string;
  shopName: string;
  password: string;
  confirmPassword: string;
  verificationId: string;
}

export interface ResetPasswordPayload {
  identifier: string;
  verificationId: string;
  newPassword: string;
  confirmPassword: string;
}

export async function sendOtp(identifier: string, purpose: OtpPurpose): Promise<void> {
  if (purpose === "RESET") {
    await api.post("/auth/forgot-password", { identifier });
    return;
  }
  await api.post("/auth/send-otp", { identifier, purpose });
}

export async function verifyOtp(
  identifier: string,
  purpose: OtpPurpose,
  otp: string
): Promise<string> {
  const res = await api.post<Envelope<{ verificationId: string }>>("/auth/verify-otp", {
    identifier,
    purpose,
    otp,
  });
  return res.data.data.verificationId;
}

export async function register(payload: RegisterPayload): Promise<Session> {
  const res = await api.post<Envelope<Session>>("/auth/register", payload);
  return res.data.data;
}

export async function login(identifier: string, password: string): Promise<Session> {
  const res = await api.post<Envelope<Session>>("/auth/login", { identifier, password });
  return res.data.data;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<void> {
  await api.post("/auth/reset-password", payload);
}
