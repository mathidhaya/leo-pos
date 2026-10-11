import { describe, expect, it } from "vitest";
import { resolveRange } from "../src/utils/dateRange";
import { generateTempPassword } from "../src/utils/tempPassword";
import {
  MIN_JOINING_DATE,
  latestJoiningDate,
  listStaffQuerySchema,
  staffBodySchema,
  staffStatusSchema,
} from "../src/validators/staff.validators";

describe("generateTempPassword", () => {
  const samples = Array.from({ length: 300 }, () => generateTempPassword());

  it("is 12 characters with a capital, a small letter and a digit", () => {
    for (const password of samples) {
      expect(password).toHaveLength(12);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/\d/);
    }
  });

  it("never uses look-alike characters", () => {
    for (const password of samples) expect(password).not.toMatch(/[IOlo01]/);
  });

  it("is different every time", () => {
    expect(new Set(samples).size).toBe(samples.length);
  });

  it("always passes the password rules used at registration", () => {
    for (const password of samples) {
      expect(password.length).toBeGreaterThanOrEqual(8);
      expect(password.length).toBeLessThanOrEqual(72);
      expect(password).toMatch(/[A-Za-z]/);
      expect(password).toMatch(/\d/);
    }
  });
});

const today = resolveRange({ range: "today" }).from;
const addDays = (ymd: string, days: number) => new Date(Date.parse(ymd) + days * 86_400_000).toISOString().slice(0, 10);

const valid = { name: "Asha Rao", phone: "98765 43210", role: "CASHIER", joiningDate: today };

function problems(input: unknown): string[] {
  const result = staffBodySchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("staffBodySchema", () => {
  it("cleans a valid staff member", () => {
    const result = staffBodySchema.safeParse({ ...valid, name: "  Asha Rao ", phone: "+91 98765-43210", email: "Asha@Example.COM" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: "Asha Rao",
        phone: "9876543210",
        email: "asha@example.com",
        role: "CASHIER",
        joiningDate: today,
      });
    }
  });

  it("makes a missing or empty email nothing", () => {
    for (const email of [undefined, ""]) {
      const result = staffBodySchema.safeParse({ ...valid, email });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.email ?? null).toBeNull();
    }
  });

  it("only allows the manager and cashier roles", () => {
    expect(problems({ ...valid, role: "MANAGER" })).toEqual([]);
    expect(problems({ ...valid, role: "OWNER" })).toEqual(["role"]);
    expect(problems({ ...valid, role: "ADMIN" })).toEqual(["role"]);
    expect(problems({ name: "Asha Rao", phone: "9876543210", joiningDate: today })).toContain("role");
  });

  it("rejects a short name, a bad phone and a bad email", () => {
    expect(problems({ ...valid, name: "A" })).toEqual(["name"]);
    expect(problems({ ...valid, phone: "12345" })).toEqual(["phone"]);
    expect(problems({ ...valid, phone: "" })).toContain("phone");
    expect(problems({ ...valid, email: "not-an-email" })).toEqual(["email"]);
  });

  it("checks the joining date", () => {
    expect(problems({ ...valid, joiningDate: MIN_JOINING_DATE })).toEqual([]);
    expect(problems({ ...valid, joiningDate: latestJoiningDate() })).toEqual([]);
    expect(problems({ ...valid, joiningDate: addDays(latestJoiningDate(), 1) })).toEqual(["joiningDate"]);
    expect(problems({ ...valid, joiningDate: "1999-12-31" })).toEqual(["joiningDate"]);
    expect(problems({ ...valid, joiningDate: "2026-02-30" })).toContain("joiningDate");
    expect(problems({ ...valid, joiningDate: "yesterday" })).toContain("joiningDate");
  });
});

describe("listStaffQuerySchema and staffStatusSchema", () => {
  it("fills in defaults", () => {
    const parsed = listStaffQuerySchema.parse({});
    expect(parsed.role).toBe("all");
    expect(parsed.status).toBe("all");
  });

  it("only allows known roles and statuses", () => {
    expect(listStaffQuerySchema.safeParse({ role: "CASHIER", status: "disabled" }).success).toBe(true);
    expect(listStaffQuerySchema.safeParse({ role: "ROOT" }).success).toBe(false);
    expect(listStaffQuerySchema.safeParse({ status: "deleted" }).success).toBe(false);
  });

  it("needs a true or false for the status", () => {
    expect(staffStatusSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(staffStatusSchema.safeParse({ isActive: "no" }).success).toBe(false);
    expect(staffStatusSchema.safeParse({}).success).toBe(false);
  });
});
