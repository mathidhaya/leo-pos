import { describe, expect, it } from "vitest";
import { escapeLike } from "../src/utils/sql";
import {
  customerBodySchema,
  listCustomersQuerySchema,
} from "../src/validators/customer.validators";

describe("customerBodySchema", () => {
  it("cleans a valid customer", () => {
    const result = customerBodySchema.safeParse({
      name: "  Asha Rao ",
      phone: "+91 98765-43210",
      email: "Asha@Example.COM",
      address: " 12 Park Street ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: "Asha Rao",
        phone: "9876543210",
        email: "asha@example.com",
        address: "12 Park Street",
      });
    }
  });

  it("turns a missing or empty email and address into nothing", () => {
    const result = customerBodySchema.safeParse({ name: "Ravi", phone: "9876543210", email: "", address: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email ?? null).toBeNull();
      expect(result.data.address ?? null).toBeNull();
    }

    const bare = customerBodySchema.safeParse({ name: "Ravi", phone: "9876543210" });
    expect(bare.success).toBe(true);
    if (bare.success) {
      expect(bare.data.email ?? null).toBeNull();
      expect(bare.data.address ?? null).toBeNull();
    }
  });

  function problems(input: unknown): string[] {
    const result = customerBodySchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
  }

  it("rejects a short name", () => {
    expect(problems({ name: "A", phone: "9876543210" })).toEqual(["name"]);
  });

  it("rejects an invalid or missing phone number", () => {
    expect(problems({ name: "Asha", phone: "12345" })).toEqual(["phone"]);
    expect(problems({ name: "Asha", phone: "5876543210" })).toEqual(["phone"]);
    expect(problems({ name: "Asha", phone: "" })).toContain("phone");
    expect(problems({ name: "Asha" })).toContain("phone");
  });

  it("rejects an invalid email", () => {
    expect(problems({ name: "Asha", phone: "9876543210", email: "not-an-email" })).toEqual(["email"]);
  });

  it("rejects an address that is too long", () => {
    expect(problems({ name: "Asha", phone: "9876543210", address: "x".repeat(301) })).toEqual(["address"]);
  });
});

describe("listCustomersQuerySchema", () => {
  it("fills in defaults", () => {
    const parsed = listCustomersQuerySchema.parse({});
    expect(parsed.sort).toBe("name");
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
  });

  it("only allows the known sort orders", () => {
    expect(listCustomersQuerySchema.safeParse({ sort: "spent" }).success).toBe(true);
    expect(listCustomersQuerySchema.safeParse({ sort: "name; DROP TABLE customers" }).success).toBe(false);
  });
});

describe("escapeLike", () => {
  it("makes wildcard characters match themselves", () => {
    expect(escapeLike("50%")).toBe("50\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
    expect(escapeLike("plain")).toBe("plain");
  });
});
