import type { DashboardData, RangeKey } from "../types/dashboard";
import { api } from "./client";

export interface DashboardQuery {
  range: RangeKey;
  from?: string;
  to?: string;
}

export async function fetchDashboard(query: DashboardQuery): Promise<DashboardData> {
  const res = await api.get<{ success: boolean; data: DashboardData }>("/dashboard", { params: query });
  return res.data.data;
}
