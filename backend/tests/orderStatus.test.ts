import { describe, expect, it } from "vitest";
import { allowedNextStatuses, canChangeStatus } from "../src/utils/orderStatus";

describe("order status rules", () => {
  it("lets an unpaid pending order move forward or be cancelled", () => {
    expect(allowedNextStatuses("PENDING", "UNPAID")).toEqual(["PREPARING", "READY", "COMPLETED", "CANCELLED"]);
  });

  it("does not offer cancel for a paid order unless the person may refund", () => {
    expect(allowedNextStatuses("PENDING", "PAID")).toEqual(["PREPARING", "READY", "COMPLETED"]);
    expect(canChangeStatus("READY", "CANCELLED", "PAID")).toBe(false);
    expect(canChangeStatus("READY", "CANCELLED", "PAID", true)).toBe(true);
  });

  it("never offers cancel for an order that is already refunded", () => {
    expect(allowedNextStatuses("PENDING", "REFUNDED", true)).not.toContain("CANCELLED");
  });

  it("never moves backwards", () => {
    expect(canChangeStatus("PREPARING", "PENDING", "UNPAID")).toBe(false);
    expect(canChangeStatus("READY", "PREPARING", "UNPAID")).toBe(false);
    expect(canChangeStatus("COMPLETED", "READY", "UNPAID")).toBe(false);
  });

  it("allows skipping steps for instant counter sales", () => {
    expect(canChangeStatus("PENDING", "COMPLETED", "PAID")).toBe(true);
  });

  it("treats completed and cancelled as final, even for refunds", () => {
    for (const payment of ["UNPAID", "PAID", "REFUNDED"] as const) {
      expect(allowedNextStatuses("COMPLETED", payment, true)).toEqual([]);
      expect(allowedNextStatuses("CANCELLED", payment, true)).toEqual([]);
    }
  });
});
