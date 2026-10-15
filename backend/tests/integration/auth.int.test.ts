import request from "supertest";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The test collects the one-time codes instead of printing them, like an SMS service would deliver them
const otpBox = vi.hoisted(() => ({ sent: [] as Array<{ identifier: string; purpose: string; otp: string }> }));
vi.mock("../../src/services/notification.service", () => ({
  deliverOtp: async (id: { value: string }, otp: string, purpose: string) => {
    otpBox.sent.push({ identifier: id.value, purpose, otp });
  },
}));

import { env } from "../../src/config/env";
import { hashToken } from "../../src/utils/tokens";
import {
  PASSWORD,
  api,
  app,
  cleanupAll,
  cookieOf,
  createShop,
  loginWith,
  phone,
  prisma,
  refreshWith,
  trackIdentifier,
  trackShop,
  uuid,
  type TestShop,
} from "./helpers";

afterAll(cleanupAll);

const lastOtp = (identifier: string, purpose: string) =>
  [...otpBox.sent].reverse().find((entry) => entry.identifier === identifier && entry.purpose === purpose)?.otp;
const wrongCodeFor = (code: string) => (code === "0000" ? "1111" : "0000");

describe("registering a cafe", () => {
  it("works through the OTP steps, and stores nothing in readable form", async () => {
    const mobile = phone();
    trackIdentifier(mobile);

    const sent = await api().post("/auth/send-otp", { identifier: mobile, purpose: "REGISTER" });
    expect(sent.status).toBe(200);
    const code = lastOtp(mobile, "REGISTER")!;
    expect(code).toMatch(/^\d{4}$/);

    // The code is stored as a hash, never as the code itself
    const row = await prisma.otpVerification.findFirst({ where: { identifier: mobile, purpose: "REGISTER" } });
    expect(row!.otpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.otpHash).not.toContain(code);

    // Asking again straight away is refused
    const again = await api().post("/auth/send-otp", { identifier: mobile, purpose: "REGISTER" });
    expect(again.status).toBe(429);
    expect(again.body.error.code).toBe("OTP_COOLDOWN");

    // A wrong code says only "Invalid OTP"
    const wrong = await api().post("/auth/verify-otp", { identifier: mobile, purpose: "REGISTER", otp: wrongCodeFor(code) });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toBe("Invalid OTP");

    const verified = await api().post("/auth/verify-otp", { identifier: mobile, purpose: "REGISTER", otp: code });
    expect(verified.status).toBe(200);
    expect(verified.body.data.message).toBe("Verified");
    const verificationId = verified.body.data.verificationId;

    const registered = await request(app)
      .post("/api/v1/auth/register")
      .send({
        identifier: mobile,
        ownerName: "Asha Owner",
        shopName: "Registered Cafe",
        password: "Strong123",
        confirmPassword: "Strong123",
        verificationId,
      });
    expect(registered.status).toBe(201);
    expect(registered.body.data.user.role).toBe("OWNER");
    expect(registered.body.data.user.shop.name).toBe("Registered Cafe");
    expect(JSON.stringify(registered.body)).not.toMatch(/passwordHash|Strong123/);
    trackShop(registered.body.data.user.shop.id);

    // The refresh cookie cannot be read by scripts
    const setCookie = ([] as string[]).concat(registered.headers["set-cookie"] as unknown as string[]).join(";");
    expect(setCookie).toMatch(/leo_refresh=/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);

    // What was saved: the password only as a bcrypt hash, the six standard categories, the settings row
    const user = await prisma.user.findUnique({ where: { id: registered.body.data.user.id } });
    expect(user!.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(user!.passwordHash).not.toContain("Strong123");
    expect(await bcrypt.compare("Strong123", user!.passwordHash)).toBe(true);
    expect(await prisma.category.count({ where: { shopId: user!.shopId } })).toBe(6);
    expect(await prisma.settings.count({ where: { shopId: user!.shopId } })).toBe(1);

    // The code can only be used once
    expect(await prisma.otpVerification.count({ where: { id: verificationId } })).toBe(0);
    const reuse = await api().post("/auth/register", {
      identifier: mobile,
      ownerName: "Someone Else",
      shopName: "Second Cafe",
      password: "Strong123",
      confirmPassword: "Strong123",
      verificationId,
    });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe("VERIFICATION_REQUIRED");
  });

  it("refuses a number that is already registered", async () => {
    const shop = await createShop("registered");
    const res = await api().post("/auth/send-otp", { identifier: shop.owner.phone, purpose: "REGISTER" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_REGISTERED");
  });

  it("locks a code after 5 wrong tries, even if the right one is entered next", async () => {
    const mobile = phone();
    trackIdentifier(mobile);
    await api().post("/auth/send-otp", { identifier: mobile, purpose: "REGISTER" });
    const code = lastOtp(mobile, "REGISTER")!;

    for (let i = 0; i < 5; i++) {
      const res = await api().post("/auth/verify-otp", { identifier: mobile, purpose: "REGISTER", otp: wrongCodeFor(code) });
      expect(res.status).toBe(400);
    }
    const locked = await api().post("/auth/verify-otp", { identifier: mobile, purpose: "REGISTER", otp: code });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("OTP_LOCKED");
  });

  it("refuses mismatched passwords and a missing verification", async () => {
    const res = await api().post("/auth/register", {
      identifier: phone(),
      ownerName: "Asha Owner",
      shopName: "Mismatch Cafe",
      password: "Strong123",
      confirmPassword: "Different123",
      verificationId: uuid(),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("can be switched off for new cafes", async () => {
    env.ALLOW_REGISTRATION = false;
    try {
      const res = await api().post("/auth/send-otp", { identifier: phone(), purpose: "REGISTER" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("REGISTRATION_CLOSED");
    } finally {
      env.ALLOW_REGISTRATION = true;
    }
  });
});

describe("logging in", () => {
  let shop: TestShop;
  beforeAll(async () => {
    shop = await createShop("login");
  });

  it("works with a phone number (however it is written) and with an email", async () => {
    const formatted = `+91 ${shop.owner.phone.slice(0, 5)}-${shop.owner.phone.slice(5)}`;
    for (const identifier of [shop.owner.phone, formatted, shop.owner.email.toUpperCase()]) {
      const res = await loginWith(identifier, PASSWORD);
      expect(res.status, identifier).toBe(200);
      expect(res.body.data.user).toMatchObject({ id: shop.owner.id, role: "OWNER" });
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
      expect(res.cookie).toBeTruthy();
    }
    const user = await prisma.user.findUnique({ where: { id: shop.owner.id } });
    expect(user!.lastLoginAt).not.toBeNull();
  });

  it("gives the same answer for a wrong password and an unknown account", async () => {
    const wrong = await loginWith(shop.owner.email, "WrongPass123");
    const unknown = await loginWith(`nobody-${uuid()}@leopos.test`, "WrongPass123");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
    expect(wrong.body.error.message).toBe("Invalid login credentials.");
  });

  it("refuses a disabled account", async () => {
    await prisma.user.update({ where: { id: shop.cashier.id }, data: { isActive: false } });
    const res = await loginWith(shop.cashier.email, PASSWORD);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_DISABLED");
    await prisma.user.update({ where: { id: shop.cashier.id }, data: { isActive: true } });
  });

  it("shows who you are with the access token", async () => {
    const login = await loginWith(shop.manager.email, PASSWORD);
    const me = await api(login.token).get("/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.user).toMatchObject({ id: shop.manager.id, role: "MANAGER" });
    expect(JSON.stringify(me.body)).not.toContain("passwordHash");
  });
});

describe("sessions", () => {
  let shop: TestShop;
  beforeAll(async () => {
    shop = await createShop("sessions");
  });

  it("rotates the refresh cookie on every use, and keeps only a hash", async () => {
    const agent = request.agent(app);
    const login = await agent.post("/api/v1/auth/login").send({ identifier: shop.cashier.email, password: PASSWORD });
    const first = cookieOf(login)!;
    expect(first).toBeTruthy();

    // Only a hash of the cookie is stored
    expect(await prisma.refreshToken.count({ where: { tokenHash: hashToken(first) } })).toBe(1);
    expect(await prisma.refreshToken.count({ where: { tokenHash: first } })).toBe(0);

    const refreshed = await agent.post("/api/v1/auth/refresh");
    expect(refreshed.status).toBe(200);
    const second = cookieOf(refreshed)!;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    // The new access token works, and the old cookie is used up
    expect((await api(refreshed.body.data.accessToken).get("/auth/me")).status).toBe(200);
    const old = await prisma.refreshToken.findFirst({ where: { tokenHash: hashToken(first) } });
    expect(old!.revokedAt).not.toBeNull();
  });

  it("ends every session when an old cookie is replayed (a sign of theft)", async () => {
    const agent = request.agent(app);
    const login = await agent.post("/api/v1/auth/login").send({ identifier: shop.manager.email, password: PASSWORD });
    const stolen = cookieOf(login)!;
    const refreshed = await agent.post("/api/v1/auth/refresh");
    const current = cookieOf(refreshed)!;

    // Pretend the stolen cookie was replaced a while ago (the grace period is 10 seconds)
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(stolen) },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    const replay = await refreshWith(stolen);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("SESSION_EXPIRED");

    // The legitimate session was ended too
    expect((await refreshWith(current)).status).toBe(401);
  });

  it("logging out ends the session", async () => {
    const login = await loginWith(shop.owner.email, PASSWORD);
    const out = await request(app).post("/api/v1/auth/logout").set("Cookie", `leo_refresh=${login.cookie}`);
    expect(out.status).toBe(200);
    expect((await refreshWith(login.cookie)).status).toBe(401);
  });

  it("refuses a refresh with no cookie, or a made-up one", async () => {
    expect((await request(app).post("/api/v1/auth/refresh")).status).toBe(401);
    expect((await refreshWith("not-a-real-cookie")).status).toBe(401);
  });
});

describe("forgot and reset password", () => {
  it("resets the password with an OTP, and ends every session", async () => {
    const shop = await createShop("reset");
    const login = await loginWith(shop.cashier.phone, PASSWORD);

    expect((await api().post("/auth/forgot-password", { identifier: shop.cashier.phone })).status).toBe(200);
    const code = lastOtp(shop.cashier.phone, "RESET")!;
    expect(code).toMatch(/^\d{4}$/);

    const verified = await api().post("/auth/verify-otp", { identifier: shop.cashier.phone, purpose: "RESET", otp: code });
    expect(verified.status).toBe(200);

    const reset = await api().post("/auth/reset-password", {
      identifier: shop.cashier.phone,
      verificationId: verified.body.data.verificationId,
      newPassword: "BrandNew123",
      confirmPassword: "BrandNew123",
    });
    expect(reset.status).toBe(200);

    expect((await loginWith(shop.cashier.phone, PASSWORD)).status).toBe(401);
    expect((await loginWith(shop.cashier.phone, "BrandNew123")).status).toBe(200);
    expect((await refreshWith(login.cookie)).status).toBe(401);

    // The code was used up
    const again = await api().post("/auth/reset-password", {
      identifier: shop.cashier.phone,
      verificationId: verified.body.data.verificationId,
      newPassword: "Another123",
      confirmPassword: "Another123",
    });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("VERIFICATION_REQUIRED");
  });

  it("does not reveal whether an account exists", async () => {
    const before = otpBox.sent.length;
    const res = await api().post("/auth/forgot-password", { identifier: phone() });
    expect(res.status).toBe(200);
    expect(otpBox.sent.length).toBe(before); // and no code was sent
  });
});
