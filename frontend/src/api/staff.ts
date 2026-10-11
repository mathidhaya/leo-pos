import type { Role } from "../types/auth";
import type { StaffList, StaffMember, StaffSecret } from "../types/staff";
import { api } from "./client";

interface Envelope<T> {
  success: boolean;
  data: T;
}

export interface StaffPayload {
  name: string;
  phone: string;
  email: string;
  role: "MANAGER" | "CASHIER";
  joiningDate: string;
}

export interface StaffListParams {
  q?: string;
  role: "all" | Role;
  status: "all" | "active" | "disabled";
}

export async function listStaff(params: StaffListParams): Promise<StaffList> {
  const res = await api.get<Envelope<StaffList>>("/staff", { params });
  return res.data.data;
}

export async function createStaff(payload: StaffPayload): Promise<StaffSecret> {
  const res = await api.post<Envelope<StaffSecret>>("/staff", payload);
  return res.data.data;
}

export async function updateStaff(id: string, payload: StaffPayload): Promise<StaffMember> {
  const res = await api.put<Envelope<StaffMember>>(`/staff/${id}`, payload);
  return res.data.data;
}

export async function setStaffStatus(id: string, isActive: boolean): Promise<StaffMember> {
  const res = await api.patch<Envelope<StaffMember>>(`/staff/${id}/status`, { isActive });
  return res.data.data;
}

export async function resetStaffPassword(id: string): Promise<StaffSecret> {
  const res = await api.post<Envelope<StaffSecret>>(`/staff/${id}/reset-password`);
  return res.data.data;
}

export async function deleteStaff(id: string): Promise<void> {
  await api.delete(`/staff/${id}`);
}
