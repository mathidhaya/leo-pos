import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAppSettings } from "../api/settings";
import type { AppSettings } from "../types/settings";

export const APP_SETTINGS_KEY = ["app-settings"] as const;

// The cafe's name, logo and defaults. The sidebar always loads this, so it is ready for every other screen.
export function useAppSettings() {
  return useQuery({ queryKey: APP_SETTINGS_KEY, queryFn: fetchAppSettings, staleTime: 60_000 });
}

// The default GST for a new product: the owner's setting if it is already loaded, otherwise 5.
export function useDefaultGst(): string {
  const queryClient = useQueryClient();
  const data = queryClient.getQueryData<AppSettings>(APP_SETTINGS_KEY);
  return data ? String(Number(data.defaultGst)) : "5";
}
