import type { Role } from "./auth";

export interface StaffMember {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: Role;
  isActive: boolean;
  joiningDate: string; // YYYY-MM-DD
  lastLoginAt: string | null;
  ordersTaken: number;
  hasHistory: boolean;
  canModify: boolean; // false for the owner
  canDelete: boolean; // false for the owner and for anyone with history
}

export interface StaffList {
  items: StaffMember[];
  summary: { total: number; active: number; disabled: number };
}

// Returned once, when a staff member is added or their password is reset
export interface StaffSecret {
  staff: StaffMember;
  temporaryPassword: string;
}
