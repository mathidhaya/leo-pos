import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import type { Identifier } from "../utils/identifier";

const BRAND = "Leo Cafe";
const VALID_MINUTES = 5;

export const emailEnabled = (): boolean => Boolean(env.SMTP_HOST && env.SMTP_FROM);
export const smsEnabled = (): boolean => Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);

export function otpMessage(otp: string): string {
  return (
    `Your ${BRAND} verification code is ${otp}. It is valid for ${VALID_MINUTES} minutes. ` +
    "If you did not ask for it, ignore this message. Never share this code with anyone."
  );
}

const deliveryFailed = () =>
  new AppError(503, "OTP_DELIVERY_FAILED", "We could not send the code. Please try again in a moment.");

// ---------- email ----------

let transport: Transporter | null = null;

function getTransport(): Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      // Port 587 must upgrade to an encrypted connection, or the message is not sent
      requireTLS: env.SMTP_PORT !== 465 && env.SMTP_PORT !== 25,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transport;
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  try {
    await getTransport().sendMail({ from: env.SMTP_FROM, to, subject, text });
  } catch (err) {
    // The real reason is for whoever runs the server. It never contains the code.
    console.error("Email delivery failed:", err instanceof Error ? err.message : "unknown error");
    throw deliveryFailed();
  }
}

// ---------- SMS (Twilio) ----------

async function sendSms(phone: string, text: string): Promise<void> {
  const sid = env.TWILIO_ACCOUNT_SID as string;
  const token = env.TWILIO_AUTH_TOKEN as string;

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      // Phone numbers are stored as 10 digits, and every number here is an Indian mobile number
      body: new URLSearchParams({ To: `+91${phone}`, From: env.TWILIO_FROM as string, Body: text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { code?: number; message?: string } | null;
      console.error("SMS delivery failed:", res.status, detail?.code ?? "", detail?.message ?? "");
      throw deliveryFailed();
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error("SMS delivery failed:", err instanceof Error ? err.name : "unknown error");
    throw deliveryFailed();
  }
}

// ---------- the two ways in ----------

async function deliver(identifier: Identifier, subject: string, text: string): Promise<void> {
  if (identifier.type === "email") {
    if (!emailEnabled()) {
      throw new AppError(503, "OTP_EMAIL_NOT_CONFIGURED", "Codes cannot be sent by email on this server yet.");
    }
    await sendEmail(identifier.value, subject, text);
    return;
  }

  if (!smsEnabled()) {
    throw new AppError(
      503,
      "OTP_SMS_NOT_CONFIGURED",
      "Codes cannot be sent to mobile numbers on this server. Please use your email address instead."
    );
  }
  await sendSms(identifier.value, text);
}

// In development the code is printed in the backend terminal. In production it is sent, and never logged.
export async function deliverOtp(identifier: Identifier, otp: string, purpose: string): Promise<void> {
  if (env.NODE_ENV !== "production") {
    console.log(`[DEV OTP] ${purpose} code for ${identifier.value}: ${otp}`);
    return;
  }
  await deliver(identifier, `Your ${BRAND} verification code`, otpMessage(otp));
}

// Used by the "send a test message" command, in any environment, to check the setup works
export async function sendTestMessage(identifier: Identifier): Promise<void> {
  await deliver(
    identifier,
    `${BRAND} test message`,
    `This is a test message from ${BRAND}. If you can read it, sending works.`
  );
}
