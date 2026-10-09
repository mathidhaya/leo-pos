import { isAxiosError } from "axios";

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ message?: string }>;
  };
}

const FALLBACK = "Something went wrong. Please try again.";

// Turns any error into a friendly sentence. Raw technical errors are never shown.
export function getErrorMessage(err: unknown): string {
  if (!isAxiosError<ApiErrorBody>(err)) return FALLBACK;

  if (!err.response) {
    return "Cannot reach the server. Check your internet connection and try again.";
  }

  const body = err.response.data?.error;
  if (!body) {
    return err.response.status >= 500
      ? "The server is not responding. Please try again in a moment."
      : FALLBACK;
  }

  return body.details?.[0]?.message ?? body.message ?? FALLBACK;
}

export function getErrorCode(err: unknown): string | undefined {
  return isAxiosError<ApiErrorBody>(err) ? err.response?.data?.error?.code : undefined;
}
