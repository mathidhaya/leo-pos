import fs from "fs";
import path from "path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.JWT_ACCESS_SECRET = "a".repeat(40);
  process.env.JWT_REFRESH_SECRET = "b".repeat(40);
  process.env.CORS_ORIGIN = "http://localhost:5173";
});

import { parseEnv } from "../src/config/env";
import { errorHandler } from "../src/middleware/errorHandler";
import { createLimiter, isAllowedOrigin, loginAttemptKey } from "../src/middleware/security";
import { AppError } from "../src/utils/AppError";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://app:Zq7vK2mP@db.internal:5432/leo",
  JWT_ACCESS_SECRET: "k3Jd9Fh2Lq8Wn5Rt7Yb1Xc4Vm6Zs0Pa2Gu8Hd3Ke",
  JWT_REFRESH_SECRET: "Qw4Er7Ty1Ui9Op3As6Df2Gh8Jk5Lz0Xc7Vb4Nm1Sa",
  CORS_ORIGIN: "https://app.example.com",
};

function problems(source: Record<string, string | undefined>): string {
  const result = parseEnv(source);
  return result.ok ? "" : result.problems.join(" | ");
}

describe("environment checks", () => {
  it("accepts a good production setup and fills in safe defaults", () => {
    const result = parseEnv(production);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.TRUST_PROXY).toBe(0);
      expect(result.env.ALLOW_REGISTRATION).toBe(true);
    }
  });

  it("accepts the development defaults", () => {
    const result = parseEnv({
      DATABASE_URL: production.DATABASE_URL,
      JWT_ACCESS_SECRET: production.JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: production.JWT_REFRESH_SECRET,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.NODE_ENV).toBe("development");
      expect(result.env.CORS_ORIGIN).toBe("http://localhost:5173");
    }
  });

  it("refuses identical or short secrets", () => {
    expect(problems({ ...production, JWT_REFRESH_SECRET: production.JWT_ACCESS_SECRET })).toContain("must be different");
    expect(problems({ ...production, JWT_ACCESS_SECRET: "short" })).toContain("JWT_ACCESS_SECRET");
  });

  it("refuses a CORS address that is not one exact address", () => {
    for (const origin of [
      "*",
      "https://*.example.com",
      "https://app.example.com/",
      "https://app.example.com/app",
      "app.example.com",
      "localhost:5173",
    ]) {
      expect(problems({ ...production, CORS_ORIGIN: origin }), origin).toContain("CORS_ORIGIN");
    }
  });

  it("needs https in production, but allows http://localhost for development", () => {
    expect(problems({ ...production, CORS_ORIGIN: "http://app.example.com" })).toContain("https://");
    expect(problems({ ...production, NODE_ENV: "development", CORS_ORIGIN: "http://localhost:5173" })).toBe("");
  });

  it("refuses placeholder secrets and passwords in production", () => {
    expect(problems({ ...production, JWT_ACCESS_SECRET: "replace-me-".padEnd(40, "x") })).toContain("placeholder");
    expect(problems({ ...production, DATABASE_URL: "postgresql://postgres:YOUR_PASSWORD@localhost:5432/leo" })).toContain("YOUR_PASSWORD");
  });

  it("checks TRUST_PROXY and ALLOW_REGISTRATION", () => {
    const ok = parseEnv({ ...production, TRUST_PROXY: "2", ALLOW_REGISTRATION: "false" });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.env.TRUST_PROXY).toBe(2);
      expect(ok.env.ALLOW_REGISTRATION).toBe(false);
    }
    expect(problems({ ...production, TRUST_PROXY: "9" })).toContain("TRUST_PROXY");
    expect(problems({ ...production, TRUST_PROXY: "abc" })).toContain("TRUST_PROXY");
    expect(problems({ ...production, ALLOW_REGISTRATION: "maybe" })).toContain("ALLOW_REGISTRATION");
  });
});

describe("isAllowedOrigin", () => {
  it("allows our own site and requests that are not from a browser", () => {
    expect(isAllowedOrigin("https://app.example.com", "https://app.example.com")).toBe(true);
    expect(isAllowedOrigin(undefined, "https://app.example.com")).toBe(true);
  });

  it("refuses any other site, including look-alikes", () => {
    for (const origin of ["https://evil.example", "https://app.example.com.evil.example", "http://app.example.com", "null", ""]) {
      expect(isAllowedOrigin(origin, "https://app.example.com"), origin).toBe(false);
    }
  });
});

describe("loginAttemptKey", () => {
  it("treats every way of typing one account as the same account", () => {
    const keys = ["9876543210", "+91 98765-43210", "098765 43210"].map((identifier) => loginAttemptKey({ identifier }));
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("login:phone:9876543210");
    expect(loginAttemptKey({ identifier: "Owner@Leo.COM " })).toBe("login:email:owner@leo.com");
  });

  it("copes with missing or strange input", () => {
    expect(loginAttemptKey(undefined)).toBe("login:invalid");
    expect(loginAttemptKey({})).toBe("login:invalid");
    expect(loginAttemptKey({ identifier: 42 })).toBe("login:invalid");
    expect(loginAttemptKey({ identifier: "  Hello World " })).toBe("login:hello world");
    expect(loginAttemptKey({ identifier: "x".repeat(500) }).length).toBe("login:".length + 100);
  });
});

describe("createLimiter", () => {
  function mini(limiter: ReturnType<typeof createLimiter>) {
    const app = express();
    app.use(limiter);
    app.get("/ok", (_req, res) => res.json({}));
    app.get("/fail", (_req, res) => res.status(401).json({}));
    return app;
  }

  it("blocks after the limit with a clear message", async () => {
    const app = mini(createLimiter({ windowMs: 60_000, limit: 3, message: "Slow down.", enforceInTests: true }));
    for (let i = 0; i < 3; i++) expect((await request(app).get("/ok")).status).toBe(200);
    const blocked = await request(app).get("/ok");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ success: false, error: { code: "RATE_LIMITED", message: "Slow down." } });
  });

  it("can count only failures", async () => {
    const app = mini(createLimiter({ windowMs: 60_000, limit: 2, message: "No.", onlyFailures: true, enforceInTests: true }));
    for (let i = 0; i < 6; i++) expect((await request(app).get("/ok")).status).toBe(200);
    expect((await request(app).get("/fail")).status).toBe(401);
    expect((await request(app).get("/fail")).status).toBe(401);
    expect((await request(app).get("/fail")).status).toBe(429);
  });

  it("keeps a separate count for each key", async () => {
    const app = mini(
      createLimiter({
        windowMs: 60_000,
        limit: 1,
        message: "No.",
        enforceInTests: true,
        keyGenerator: (req) => String(req.headers["x-key"] ?? "none"),
      })
    );
    expect((await request(app).get("/ok").set("x-key", "a")).status).toBe(200);
    expect((await request(app).get("/ok").set("x-key", "a")).status).toBe(429);
    expect((await request(app).get("/ok").set("x-key", "b")).status).toBe(200);
  });

  it("is switched off in tests unless a test asks for it", async () => {
    const app = mini(createLimiter({ windowMs: 60_000, limit: 1, message: "No." }));
    for (let i = 0; i < 5; i++) expect((await request(app).get("/ok")).status).toBe(200);
  });
});

describe("errorHandler", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function run(err: unknown) {
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };
    errorHandler(err as never, {} as never, res as never, (() => undefined) as never);
    return res;
  }

  it("never shows the details of an unexpected error", () => {
    const res = run(new Error('duplicate key value violates unique constraint "users_email_key" password=hunter2'));
    expect(res.statusCode).toBe(500);
    const text = JSON.stringify(res.body);
    expect(text).toContain("INTERNAL_ERROR");
    expect(text).not.toMatch(/duplicate|constraint|hunter2|users_email_key|stack/i);
  });

  it("passes on our own errors", () => {
    const res = run(new AppError(409, "SKU_TAKEN", "Taken."));
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ success: false, error: { code: "SKU_TAKEN", message: "Taken." } });
  });

  it("turns validation problems into a 400 with the field names", () => {
    const failed = z.object({ name: z.string() }).safeParse({});
    expect(failed.success).toBe(false);
    if (failed.success) return;
    const res = run(failed.error);
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.body)).toContain("VALIDATION_ERROR");
    expect(JSON.stringify(res.body)).toContain('"field":"name"');
  });

  it("handles oversized and broken requests and uploads", () => {
    expect(run(Object.assign(new Error("too big"), { type: "entity.too.large" })).statusCode).toBe(413);
    expect(run(Object.assign(new Error("bad"), { type: "entity.parse.failed" })).statusCode).toBe(400);
    const upload = run(Object.assign(new Error("File too large"), { name: "MulterError", code: "LIMIT_FILE_SIZE" }));
    expect(upload.statusCode).toBe(400);
    expect(JSON.stringify(upload.body)).toContain("IMAGE_TOO_LARGE");
  });
});

// ---------- scans of the source code, so a risky habit cannot creep back in ----------

function sourceFiles(dir: string, extensions: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated" || entry.name === "node_modules") continue;
      found.push(...sourceFiles(full, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

const backendSrc = path.resolve(process.cwd(), "src");
const frontendSrc = path.resolve(process.cwd(), "../frontend/src");
const rel = (file: string) => path.relative(process.cwd(), file).replace(/\\/g, "/");

function filesContaining(files: string[], pattern: RegExp): string[] {
  return files.filter((file) => pattern.test(fs.readFileSync(file, "utf8"))).map(rel).sort();
}

describe("code scans", () => {
  it("the frontend never puts text into the page as HTML or runs text as code", () => {
    const files = sourceFiles(frontendSrc, [".ts", ".tsx"]);
    if (files.length === 0) return; // the frontend folder is not next to this one
    expect(filesContaining(files, /dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\(|\beval\(|new Function\(/)).toEqual([]);
  });

  it("raw SQL with plain text is only used in the three reviewed files", () => {
    const files = sourceFiles(backendSrc, [".ts"]);
    expect(filesContaining(files, /\$(?:queryRawUnsafe|executeRawUnsafe)\b/)).toEqual([
      "src/services/customer.service.ts",
      "src/services/dashboard.service.ts",
      "src/services/report.service.ts",
    ]);
  });

  it("only a few files may mention a password hash, and no controller does", () => {
    const files = sourceFiles(backendSrc, [".ts"]);
    expect(filesContaining(files, /passwordHash/)).toEqual([
      "src/services/account.service.ts",
      "src/services/auth.service.ts",
      "src/services/staff.service.ts",
    ]);
    expect(filesContaining(sourceFiles(path.join(backendSrc, "controllers"), [".ts"]), /passwordHash/)).toEqual([]);
  });

  it("nothing but the start-up message and the development OTP prints with console.log", () => {
    const files = sourceFiles(backendSrc, [".ts"]);
    expect(filesContaining(files, /console\.log\(/)).toEqual(["src/server.ts", "src/services/notification.service.ts"]);
  });
});
