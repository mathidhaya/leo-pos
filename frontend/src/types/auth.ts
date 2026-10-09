export type Role = "OWNER" | "MANAGER" | "CASHIER";

export type OtpPurpose = "REGISTER" | "RESET";

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  shop: { id: string; name: string };
}

export interface Session {
  accessToken: string;
  expiresInSeconds: number;
  user: User;
}
