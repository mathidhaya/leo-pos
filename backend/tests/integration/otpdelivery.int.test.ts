import { afterAll, describe, expect, it, vi } from "vitest";

const mode = vi.hoisted(() => ({ fail: true }));

// Sending always fails, like an email service that is down
vi.mock("../../src/services/notification.service", async () => {
  const { AppError } = await import("../../src/utils/AppError");
  return {
    deliverOtp: async () => {
      if (mode.fail) throw new AppError(503, "OTP_DELIVERY_FAILED", "We could not send the code. Please try again in a moment.");
    },
  };
});

import { api, cleanupAll, createShop, phone, trackIdentifier } from "./helpers";

afterAll(cleanupAll);

describe("when a code cannot be delivered", () => {
  it("a new registration is told so", async () => {
    const mobile = phone();
    trackIdentifier(mobile);
    const res = await api().post("/auth/send-otp", { identifier: mobile, purpose: "REGISTER" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("OTP_DELIVERY_FAILED");
  });

  it("a password reset looks exactly like a success, so nobody can find out who has an account", async () => {
    const shop = await createShop("otp-delivery");
    trackIdentifier(shop.cashier.phone);
    const unknown = phone();
    trackIdentifier(unknown);

    const known = await api().post("/auth/forgot-password", { identifier: shop.cashier.phone });
    const stranger = await api().post("/auth/forgot-password", { identifier: unknown });

    expect(known.status).toBe(200);
    expect(stranger.status).toBe(200);
    expect(known.body).toEqual(stranger.body);
  });
});
