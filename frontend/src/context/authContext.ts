import { createContext } from "react";
import type { RegisterPayload } from "../api/auth";
import type { User } from "../types/auth";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
