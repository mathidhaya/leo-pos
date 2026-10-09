import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import type { Identifier } from "../utils/identifier";

// Sending a real SMS or email needs an external service:
//   - SMS: a provider such as MSG91, Fast2SMS or Twilio (needs an account, API key and DLT approval in India)
//   - Email: an SMTP server or a service such as Resend
// Until one is connected, development prints the OTP in this terminal.
// In production this refuses to run, so a code is never shown in logs or sent insecurely.
export async function deliverOtp(identifier: Identifier, otp: string, purpose: string): Promise<void> {
  if (env.NODE_ENV === "production") {
    throw new AppError(503, "OTP_PROVIDER_NOT_CONFIGURED", "OTP service is not available right now.");
  }
  console.log(`[DEV OTP] ${purpose} code for ${identifier.value}: ${otp}`);
}
