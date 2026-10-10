import type { RoleName } from "./auth";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; shopId: string; role: RoleName };
    }
  }
}

export {};
