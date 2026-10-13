import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { changedFields } from "../src/utils/changedFields";
import {
  accountProfileSchema,
  billingSchema,
  changePasswordSchema,
  receiptSchema,
  shopSchema,
} from "../src/validators/settings.validators";

function problems(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

const logo = "/uploads/3f2b8c1e-5d4a-4b6e-9a7c-1d2e3f4a5b6c.png";

describe("shopSchema", () => {
  it("cleans a valid cafe", () => {
    const result = shopSchema.safeParse({
      name: "  Leo Cafe ",
      address: " 12 Park Street ",
      phone: " 044 2345 6789 ",
      email: "Hello@LeoCafe.COM",
      gstNumber: "22aaaaa0000a1z5",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Leo Cafe");
      expect(result.data.address).toBe("12 Park Street");
      expect(result.data.phone).toBe("044 2345 6789");
      expect(result.data.email).toBe("hello@leocafe.com");
      expect(result.data.gstNumber).toBe("22AAAAA0000A1Z5");
    }
  });

  it("turns empty optional fields into nothing", () => {
    const result = shopSchema.safeParse({ name: "Leo Cafe", address: "", phone: "", email: "", gstNumber: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.address).toBeNull();
      expect(result.data.phone).toBeNull();
      expect(result.data.email).toBeNull();
      expect(result.data.gstNumber).toBeNull();
    }
  });

  it("rejects a short name, a bad phone and a bad email", () => {
    expect(problems(shopSchema, { name: "L" })).toEqual(["name"]);
    expect(problems(shopSchema, { name: "Leo Cafe", phone: "abc" })).toEqual(["phone"]);
    expect(problems(shopSchema, { name: "Leo Cafe", phone: "123" })).toEqual(["phone"]);
    expect(problems(shopSchema, { name: "Leo Cafe", email: "nope" })).toEqual(["email"]);
  });

  it("checks the GST number format", () => {
    const bad = [
      "22AAAAA0000A1Z", // 14 characters
      "00AAAAA0000A1Z5", // there is no state 00
      "22AAAAA0000A1X5", // the 14th character must be Z
      "22AAAA10000A1Z5", // the PAN part needs 5 letters
      "not a gst number",
    ];
    for (const gstNumber of bad) {
      expect(problems(shopSchema, { name: "Leo Cafe", gstNumber })).toEqual(["gstNumber"]);
    }
    expect(problems(shopSchema, { name: "Leo Cafe", gstNumber: "27AAPFU0939F1ZV" })).toEqual([]);
  });

  it("only accepts a logo that this system saved", () => {
    expect(problems(shopSchema, { name: "Leo Cafe", logoUrl: logo })).toEqual([]);
    expect(problems(shopSchema, { name: "Leo Cafe", logoUrl: null })).toEqual([]);
    expect(problems(shopSchema, { name: "Leo Cafe", logoUrl: "http://evil.example/x.png" })).toEqual(["logoUrl"]);
    expect(problems(shopSchema, { name: "Leo Cafe", logoUrl: "/uploads/../secret.png" })).toEqual(["logoUrl"]);
  });
});

describe("billingSchema", () => {
  it("accepts a normal setup and capitalises the prefix", () => {
    const result = billingSchema.safeParse({ invoicePrefix: " lc ", defaultGst: "5", defaultDiscount: 12.5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.invoicePrefix).toBe("LC");
      expect(result.data.defaultGst).toBe("5");
      expect(result.data.defaultDiscount).toBe("12.5");
    }
  });

  it("limits the prefix to 1 to 6 letters or numbers", () => {
    for (const invoicePrefix of ["", "L-C", "ABCDEFG", "L C", "LC#"]) {
      expect(problems(billingSchema, { invoicePrefix, defaultGst: "5", defaultDiscount: "0" })).toEqual(["invoicePrefix"]);
    }
    expect(problems(billingSchema, { invoicePrefix: "CAFE01", defaultGst: "5", defaultDiscount: "0" })).toEqual([]);
  });

  it("keeps percentages between 0 and 100 with up to 2 decimals", () => {
    for (const bad of ["100.5", "101", "-1", "abc", "1.234", ""]) {
      expect(problems(billingSchema, { invoicePrefix: "LC", defaultGst: bad, defaultDiscount: "0" })).toEqual(["defaultGst"]);
      expect(problems(billingSchema, { invoicePrefix: "LC", defaultGst: "5", defaultDiscount: bad })).toEqual(["defaultDiscount"]);
    }
    for (const good of ["0", "5", "12.5", "18.00", "100"]) {
      expect(problems(billingSchema, { invoicePrefix: "LC", defaultGst: good, defaultDiscount: good })).toEqual([]);
    }
  });
});

describe("receiptSchema", () => {
  const base = { receiptFooter: "Thank you!", printerName: "Counter", showGst: true, showCashier: false };

  it("accepts a normal setup", () => {
    expect(problems(receiptSchema, base)).toEqual([]);
  });

  it("needs a footer of 1 to 120 characters", () => {
    expect(problems(receiptSchema, { ...base, receiptFooter: "   " })).toEqual(["receiptFooter"]);
    expect(problems(receiptSchema, { ...base, receiptFooter: "x".repeat(121) })).toEqual(["receiptFooter"]);
    expect(problems(receiptSchema, { ...base, receiptFooter: "x".repeat(120) })).toEqual([]);
  });

  it("makes an empty printer name nothing, and needs real switches", () => {
    const result = receiptSchema.safeParse({ ...base, printerName: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.printerName).toBeNull();
    expect(problems(receiptSchema, { ...base, showGst: "yes" })).toEqual(["showGst"]);
  });
});

describe("accountProfileSchema", () => {
  it("cleans the phone number and email", () => {
    const result = accountProfileSchema.safeParse({ name: " Asha Rao ", phone: "+91 98765-43210", email: "Asha@X.COM" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Asha Rao");
      expect(result.data.phone).toBe("9876543210");
      expect(result.data.email).toBe("asha@x.com");
    }
  });

  it("needs at least a phone number or an email", () => {
    expect(problems(accountProfileSchema, { name: "Asha Rao", phone: "", email: "" })).toEqual(["phone"]);
    expect(problems(accountProfileSchema, { name: "Asha Rao", phone: "9876543210", email: "" })).toEqual([]);
    expect(problems(accountProfileSchema, { name: "Asha Rao", phone: "", email: "a@b.com" })).toEqual([]);
  });

  it("rejects a bad name, phone or email", () => {
    expect(problems(accountProfileSchema, { name: "A", phone: "9876543210" })).toEqual(["name"]);
    expect(problems(accountProfileSchema, { name: "Asha Rao", phone: "12345" })).toEqual(["phone"]);
    expect(problems(accountProfileSchema, { name: "Asha Rao", phone: "9876543210", email: "nope" })).toEqual(["email"]);
  });
});

describe("changePasswordSchema", () => {
  const base = { currentPassword: "Old12345", newPassword: "NewPass123", confirmPassword: "NewPass123" };

  it("accepts a good new password", () => {
    expect(problems(changePasswordSchema, base)).toEqual([]);
  });

  it("applies the same rules as registration", () => {
    for (const newPassword of ["short1", "allletters", "12345678"]) {
      expect(problems(changePasswordSchema, { ...base, newPassword, confirmPassword: newPassword })).toEqual(["newPassword"]);
    }
  });

  it("needs the confirmation to match", () => {
    expect(problems(changePasswordSchema, { ...base, confirmPassword: "Different123" })).toEqual(["confirmPassword"]);
  });

  it("needs a new password that differs from the current one", () => {
    expect(
      problems(changePasswordSchema, { currentPassword: "SamePass123", newPassword: "SamePass123", confirmPassword: "SamePass123" })
    ).toEqual(["newPassword"]);
  });

  it("needs the current password", () => {
    expect(problems(changePasswordSchema, { ...base, currentPassword: "" })).toEqual(["currentPassword"]);
  });
});

describe("changedFields", () => {
  it("lists only what really changed", () => {
    expect(changedFields({ name: "A", city: "X", note: null }, { name: "B", city: "X", note: "" })).toEqual(["name"]);
  });

  it("treats null, undefined and empty text as the same", () => {
    expect(changedFields({ a: null, b: undefined, c: "" }, { a: "", b: null, c: null })).toEqual([]);
  });

  it("ignores fields that were not sent, and compares numbers as text", () => {
    expect(changedFields({ a: 1, b: 2 }, { a: 1, b: undefined })).toEqual([]);
    expect(changedFields({ a: "5.00" }, { a: "5.00" })).toEqual([]);
    expect(changedFields({ a: "5.00" }, { a: "12.50" })).toEqual(["a"]);
  });
});
