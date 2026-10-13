import type { Account } from "../types/settings";
import { api } from "./client";

interface Envelope<T> {
  success: boolean;
  data: T;
}

export interface ProfilePayload {
  name: string;
  phone: string;
  email: string;
  currentPassword?: string;
}

export interface PasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export async function getAccount(): Promise<Account> {
  const res = await api.get<Envelope<Account>>("/account");
  return res.data.data;
}

export async function updateProfile(payload: ProfilePayload): Promise<Account> {
  const res = await api.put<Envelope<Account>>("/account/profile", payload);
  return res.data.data;
}

// Returns how many OTHER devices were logged out
export async function changePassword(payload: PasswordPayload): Promise<number> {
  const res = await api.post<Envelope<{ message: string; otherSessionsEnded: number }>>("/account/change-password", payload);
  return res.data.data.otherSessionsEnded;
}
