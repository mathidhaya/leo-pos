import { describe, expect, it } from "vitest";
import { normalizePhone } from "../src/utils/phone";
import { createOrderSchema } from "../src/validators/order.validators";

const base = {
  items: [{ productId: "3f2b8c1e-5d4a-4b6e-9a7c-1d2e3f4a5b6c", quantity: 2 }],
  discount: { type: "none" as const },
  idempotencyKey: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  expectedTotal: "315.00",
};

function problems(input: unknown): string[] {
  const result = createOrderSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("createOrderSchema", () => {
  it("accepts a simple dine-in order", () => {
    expect(problems({ ...base, orderType: "DINE_IN", tableNo: "T4", guests: 3 })).toEqual([]);
  });

  it("accepts a take-away order with no customer details", () => {
    expect(problems({ ...base, orderType: "TAKE_AWAY" })).toEqual([]);
  });

  it("rejects a take-away order with a bad phone number", () => {
    expect(problems({ ...base, orderType: "TAKE_AWAY", customerPhone: "12345" })).toEqual(["customerPhone"]);
  });

  it("requires name, phone and address for delivery", () => {
    expect(problems({ ...base, orderType: "DELIVERY" }).sort()).toEqual(["address", "customerName", "customerPhone"]);
  });

  it("accepts a complete delivery order", () => {
    expect(
      problems({
        ...base,
        orderType: "DELIVERY",
        deliveryCharge: "30",
        customerName: "Asha",
        customerPhone: "98765 43210",
        address: "12 Park Street",
      })
    ).toEqual([]);
  });

  it("rejects a missing request key or an invalid total", () => {
    expect(problems({ ...base, orderType: "DINE_IN", idempotencyKey: undefined })).toContain("idempotencyKey");
    expect(problems({ ...base, orderType: "DINE_IN", expectedTotal: "abc" })).toContain("expectedTotal");
  });

  it("rejects zero people", () => {
    expect(problems({ ...base, orderType: "DINE_IN", guests: 0 })).toEqual(["guests"]);
  });
});

describe("normalizePhone", () => {
  it("cleans valid numbers", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("9876543210");
    expect(normalizePhone("09876543210")).toBe("9876543210");
  });

  it("rejects invalid numbers", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("5876543210")).toBeNull();
  });
});
