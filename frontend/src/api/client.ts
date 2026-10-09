import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { Session } from "../types/auth";
import { getAccessToken, setAccessToken } from "./tokenStore";

export const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
});

let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

// Only one refresh request runs at a time. Everyone who asks shares the same one.
let refreshing: Promise<Session> | null = null;

export function refreshSession(): Promise<Session> {
  if (!refreshing) {
    refreshing = axios
      .post<{ data: Session }>("/api/v1/auth/refresh", null, { withCredentials: true })
      .then((res) => {
        setAccessToken(res.data.data.accessToken);
        return res.data.data;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

type RetryableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryableConfig | undefined;
    const isAuthCall = original?.url?.startsWith("/auth/") ?? false;

    // If the access token expired, get a new one and repeat the request once.
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        await refreshSession();
        return api(original);
      } catch {
        setAccessToken(null);
        onSessionExpired?.();
      }
    }

    return Promise.reject(error);
  }
);
