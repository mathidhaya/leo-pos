import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.JWT_ACCESS_SECRET = "a".repeat(40);
  process.env.JWT_REFRESH_SECRET = "b".repeat(40);
  process.env.CORS_ORIGIN = "http://localhost:5173";
  return {
    prisma: {
      user: { findFirst: vi.fn() },
      otpVerification: {
        count: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
        aggregate: vi.fn(),
        update: vi.fn(),
      },
    },
    deliverOtp: vi.fn(),
  };
});

vi.mock("../src/config/db", () => ({ prisma: mocks.prisma }));
vi.mock("../src/services/notification.service", () => ({ deliverOtp: mocks.deliverOtp }));

import { env } from "../src/config/env";
import {
  OTP_MAX_ATTEMPTS_PER_DAY,
  OTP_MAX_SENDS_PER_HOUR,
  sendOtp,
  verifyOtp,
} from "../src/services/auth.service";
import { hashOtp } from "../src/utils/otp";

const PHONE = "9876543210";
const activeUser = { id: "u1", isActive: true, shop: { id: "s1", name: "Leo" } };
const otp = mocks.prisma.otpVerification;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.user.findFirst.mockResolvedValue(null);
  otp.count.mockResolvedValue(0);
  otp.findFirst.mockResolvedValue(null);
  otp.create.mockResolvedValue({});
  otp.deleteMany.mockResolvedValue({ count: 0 });
  otp.aggregate.mockResolvedValue({ _sum: { attempts: 0 } });
  otp.update.mockResolvedValue({ attempts: 1 });
  env.ALLOW_REGISTRATION = true;
});

describe("sending codes", () => {
  it("stops a registration after too many codes in an hour", async () => {
    otp.count.mockResolvedValue(OTP_MAX_SENDS_PER_HOUR);
    await expect(sendOtp(PHONE, "REGISTER")).rejects.toMatchObject({ code: "OTP_RATE_LIMITED", statusCode: 429 });
    expect(otp.create).not.toHaveBeenCalled();
    expect(mocks.deliverOtp).not.toHaveBeenCalled();
  });

  it("stays silent for a password reset over the limit, so nobody learns who has an account", async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(activeUser);
    otp.count.mockResolvedValue(OTP_MAX_SENDS_PER_HOUR);
    await expect(sendOtp(PHONE, "RESET")).resolves.toBeUndefined();
    expect(otp.create).not.toHaveBeenCalled();
    expect(mocks.deliverOtp).not.toHaveBeenCalled();
  });

  it("does nothing, and looks the same, for a reset on an unknown account", async () => {
    await expect(sendOtp(PHONE, "RESET")).resolves.toBeUndefined();
    expect(otp.count).not.toHaveBeenCalled();
    expect(otp.create).not.toHaveBeenCalled();
  });

  it("keeps only a hash of the code, and never deletes the tries already used", async () => {
    await sendOtp(PHONE, "REGISTER");

    expect(otp.create).toHaveBeenCalledTimes(1);
    const data = otp.create.mock.calls[0][0].data;
    const delivered = mocks.deliverOtp.mock.calls[0][1] as string;

    expect(delivered).toMatch(/^\d{4}$/);
    expect(data.otpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.otpHash).not.toContain(delivered);
    expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(4 * 60 * 1000);
    expect(data.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);

    // The only clean-up removes OLD records, never the ones for this number
    expect(otp.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: expect.any(Date) } } });
  });

  it("refuses new registrations when they are switched off, but not password resets", async () => {
    env.ALLOW_REGISTRATION = false;
    await expect(sendOtp(PHONE, "REGISTER")).rejects.toMatchObject({ code: "REGISTRATION_CLOSED", statusCode: 403 });

    mocks.prisma.user.findFirst.mockResolvedValue(activeUser);
    await expect(sendOtp(PHONE, "RESET")).resolves.toBeUndefined();
    expect(otp.create).toHaveBeenCalledTimes(1);
  });
});

describe("checking codes", () => {
  const goodRow = () => ({
    id: "r1",
    otpHash: hashOtp(PHONE, "REGISTER", "1234"),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
  });

  it("locks an account after too many wrong tries in a day, however many codes were sent", async () => {
    otp.aggregate.mockResolvedValue({ _sum: { attempts: OTP_MAX_ATTEMPTS_PER_DAY } });
    await expect(verifyOtp(PHONE, "REGISTER", "1234")).rejects.toMatchObject({ code: "OTP_LOCKED", statusCode: 429 });
    expect(otp.update).not.toHaveBeenCalled();
  });

  it("says only 'Invalid OTP' for a wrong code", async () => {
    otp.findFirst.mockResolvedValue(goodRow());
    await expect(verifyOtp(PHONE, "REGISTER", "9999")).rejects.toMatchObject({
      code: "INVALID_OTP",
      message: "Invalid OTP",
    });
  });

  it("accepts the right code and counts it as a try", async () => {
    otp.findFirst.mockResolvedValue(goodRow());
    await expect(verifyOtp(PHONE, "REGISTER", "1234")).resolves.toEqual({ verificationId: "r1" });
    expect(otp.update).toHaveBeenCalledTimes(2);
    expect(otp.update.mock.calls[0][0].data).toEqual({ attempts: { increment: 1 } });
    expect(otp.update.mock.calls[1][0].data.verifiedAt).toBeInstanceOf(Date);
  });

  it("locks one code after 5 wrong tries, even with the right code", async () => {
    otp.findFirst.mockResolvedValue(goodRow());
    otp.update.mockResolvedValue({ attempts: 6 });
    await expect(verifyOtp(PHONE, "REGISTER", "1234")).rejects.toMatchObject({ code: "OTP_LOCKED" });
  });

  it("refuses an expired code without counting a try", async () => {
    otp.findFirst.mockResolvedValue({ ...goodRow(), expiresAt: new Date(Date.now() - 1000) });
    await expect(verifyOtp(PHONE, "REGISTER", "1234")).rejects.toMatchObject({ code: "OTP_EXPIRED" });
    expect(otp.update).not.toHaveBeenCalled();
  });
});
