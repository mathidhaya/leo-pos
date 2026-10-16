import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.JWT_ACCESS_SECRET = "a".repeat(40);
  process.env.JWT_REFRESH_SECRET = "b".repeat(40);
  process.env.CORS_ORIGIN = "http://localhost:5173";
  return { sendMail: vi.fn(), createTransport: vi.fn() };
});

vi.mock("nodemailer", () => ({ default: { createTransport: mocks.createTransport } }));

import { env } from "../src/config/env";
import { deliverOtp, emailEnabled, otpMessage, sendTestMessage, smsEnabled } from "../src/services/notification.service";

const email = { type: "email" as const, value: "owner@example.com" };
const mobile = { type: "phone" as const, value: "9876543210" };
const SID = `AC${"a".repeat(32)}`;
const fetchMock = vi.fn();

function allOff() {
  env.SMTP_HOST = undefined;
  env.SMTP_FROM = undefined;
  env.SMTP_USER = undefined;
  env.SMTP_PASS = undefined;
  env.TWILIO_ACCOUNT_SID = undefined;
  env.TWILIO_AUTH_TOKEN = undefined;
  env.TWILIO_FROM = undefined;
}
const emailOn = () => {
  env.SMTP_HOST = "smtp.test.local";
  env.SMTP_FROM = "Leo Cafe <no-reply@example.com>";
};
const smsOn = () => {
  env.TWILIO_ACCOUNT_SID = SID;
  env.TWILIO_AUTH_TOKEN = "token-123";
  env.TWILIO_FROM = "+15005550006";
};

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
  mocks.sendMail.mockResolvedValue({});
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  env.NODE_ENV = "production";
  allOff();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  env.NODE_ENV = "test";
  allOff();
});

const printed = (spy: ReturnType<typeof vi.spyOn>) => JSON.stringify(spy.mock.calls);

describe("what is configured", () => {
  it("email needs a server and a sender, SMS needs all three Twilio settings", () => {
    expect(emailEnabled()).toBe(false);
    expect(smsEnabled()).toBe(false);
    emailOn();
    smsOn();
    expect(emailEnabled()).toBe(true);
    expect(smsEnabled()).toBe(true);
    env.TWILIO_FROM = undefined;
    expect(smsEnabled()).toBe(false);
  });

  it("the message has the code, the lifetime and a warning", () => {
    const text = otpMessage("4821");
    expect(text).toContain("4821");
    expect(text).toContain("5 minutes");
    expect(text.toLowerCase()).toContain("never share");
  });
});

describe("in development", () => {
  it("prints the code in the terminal and sends nothing", async () => {
    env.NODE_ENV = "development";
    emailOn();
    smsOn();
    await deliverOtp(email, "4821", "REGISTER");
    expect(printed(logSpy)).toContain("4821");
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("in production, by email", () => {
  it("sends the code to the address, and never prints it", async () => {
    emailOn();
    await deliverOtp(email, "4821", "REGISTER");

    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    const message = mocks.sendMail.mock.calls[0][0];
    expect(message).toMatchObject({ to: "owner@example.com", from: "Leo Cafe <no-reply@example.com>" });
    expect(message.text).toContain("4821");
    expect(message.subject).not.toContain("4821");
    expect(printed(logSpy)).not.toContain("4821");
  });

  it("says so when email is not set up", async () => {
    await expect(deliverOtp(email, "4821", "REGISTER")).rejects.toMatchObject({
      code: "OTP_EMAIL_NOT_CONFIGURED",
      statusCode: 503,
    });
  });

  it("gives a friendly error when sending fails, and never puts the code in the log", async () => {
    emailOn();
    mocks.sendMail.mockRejectedValue(new Error("535 authentication failed"));
    await expect(deliverOtp(email, "4821", "REGISTER")).rejects.toMatchObject({ code: "OTP_DELIVERY_FAILED", statusCode: 503 });
    expect(printed(errorSpy)).toContain("535");
    expect(printed(errorSpy)).not.toContain("4821");
  });
});

describe("in production, by SMS", () => {
  it("sends the code to the +91 number through Twilio", async () => {
    smsOn();
    await deliverOtp(mobile, "4821", "RESET");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`${SID}:token-123`).toString("base64")}`);
    const body = String(init.body);
    expect(body).toContain("To=%2B919876543210");
    expect(body).toContain("From=%2B15005550006");
    expect(body).toContain("4821");
    expect(printed(logSpy)).not.toContain("4821");
  });

  it("tells a mobile number to use email when SMS is not set up", async () => {
    emailOn();
    await expect(deliverOtp(mobile, "4821", "REGISTER")).rejects.toMatchObject({
      code: "OTP_SMS_NOT_CONFIGURED",
      statusCode: 503,
      message: expect.stringContaining("email"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives a friendly error when the service refuses or cannot be reached, without the code in the log", async () => {
    smsOn();
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ code: 21211, message: "Invalid To number" }) });
    await expect(deliverOtp(mobile, "4821", "REGISTER")).rejects.toMatchObject({ code: "OTP_DELIVERY_FAILED" });
    expect(printed(errorSpy)).toContain("21211");

    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(deliverOtp(mobile, "4821", "REGISTER")).rejects.toMatchObject({ code: "OTP_DELIVERY_FAILED" });
    expect(printed(errorSpy)).not.toContain("4821");
  });
});

describe("the test message", () => {
  it("works in any environment, and holds no code", async () => {
    env.NODE_ENV = "development";
    emailOn();
    await sendTestMessage(email);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    const message = mocks.sendMail.mock.calls[0][0];
    expect(message.text).toContain("test message");
    expect(message.text).not.toMatch(/\d{4}/);
  });
});
