import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.JWT_ACCESS_SECRET = "a".repeat(40);
  process.env.JWT_REFRESH_SECRET = "b".repeat(40);
  process.env.CORS_ORIGIN = "http://localhost:5173";
  return { users: new Map<string, { id: string; shopId: string; role: string; isActive: boolean }>() };
});

// The database is replaced by a stand-in that only knows who is logged in.
// Every other database call returns nothing, which is enough to see who gets through the door.
vi.mock("../src/config/db", () => {
  const fake: any = new Proxy(function () {}, {
    get: (_target, prop) => (prop === "then" ? undefined : fake),
    apply: () => Promise.resolve(null),
  });
  const user = new Proxy(
    { findUnique: async (args: any) => mocks.users.get(args?.where?.id) ?? null } as Record<string | symbol, unknown>,
    { get: (target, prop) => (prop in target ? target[prop] : fake) }
  );
  return { prisma: new Proxy({}, { get: (_target, prop) => (prop === "user" ? user : fake) }) };
});

import { app } from "../src/app";
import { env } from "../src/config/env";
import { signAccessToken } from "../src/utils/tokens";

type Access = "public" | "any" | "OWNER" | "OWNER,MANAGER" | "OWNER,CASHIER";
type Role = "OWNER" | "MANAGER" | "CASHIER";
interface Rule {
  route: string;
  access: Access;
  body?: boolean; // the route validates a request body
}

// ---------------------------------------------------------------------------------------------
// THE ACCESS MATRIX. Every route in the app, and who may use it.
//   public        no login needed
//   any           any logged-in person (owner, manager or cashier)
//   OWNER, ...    only these roles
// Adding a route without adding it here makes the test below fail, so access is always a decision.
// ---------------------------------------------------------------------------------------------
const RULES: Rule[] = [
  { route: "GET /api/v1/health", access: "public" },
  { route: "GET /api/v1/health/db", access: "public" },

  { route: "POST /api/v1/auth/send-otp", access: "public", body: true },
  { route: "POST /api/v1/auth/verify-otp", access: "public", body: true },
  { route: "POST /api/v1/auth/register", access: "public", body: true },
  { route: "POST /api/v1/auth/login", access: "public", body: true },
  { route: "POST /api/v1/auth/refresh", access: "public" },
  { route: "POST /api/v1/auth/logout", access: "public" },
  { route: "POST /api/v1/auth/forgot-password", access: "public", body: true },
  { route: "POST /api/v1/auth/reset-password", access: "public", body: true },
  { route: "GET /api/v1/auth/me", access: "any" },

  { route: "GET /api/v1/dashboard", access: "any" },

  { route: "GET /api/v1/categories", access: "any" },
  { route: "POST /api/v1/categories", access: "OWNER,MANAGER", body: true },
  { route: "PUT /api/v1/categories/:id", access: "OWNER,MANAGER", body: true },
  { route: "DELETE /api/v1/categories/:id", access: "OWNER,MANAGER" },

  { route: "GET /api/v1/products", access: "any" },
  { route: "GET /api/v1/products/:id", access: "any" },
  { route: "POST /api/v1/products", access: "OWNER,MANAGER", body: true },
  { route: "PUT /api/v1/products/:id", access: "OWNER,MANAGER", body: true },
  { route: "PATCH /api/v1/products/:id/availability", access: "OWNER,MANAGER", body: true },
  { route: "DELETE /api/v1/products/:id", access: "OWNER,MANAGER" },

  { route: "POST /api/v1/uploads/image", access: "OWNER,MANAGER" },

  { route: "GET /api/v1/pos/catalog", access: "OWNER,CASHIER" },
  { route: "POST /api/v1/pos/quote", access: "OWNER,CASHIER", body: true },

  { route: "GET /api/v1/orders", access: "any" },
  { route: "GET /api/v1/orders/:id", access: "any" },
  { route: "PATCH /api/v1/orders/:id/status", access: "any", body: true },
  { route: "POST /api/v1/orders", access: "OWNER,CASHIER", body: true },

  { route: "GET /api/v1/payments", access: "OWNER,CASHIER" },
  { route: "POST /api/v1/payments", access: "OWNER,CASHIER", body: true },

  { route: "GET /api/v1/invoices", access: "OWNER,CASHIER" },
  { route: "GET /api/v1/invoices/:id", access: "OWNER,CASHIER" },
  { route: "GET /api/v1/invoices/:id/pdf", access: "OWNER,CASHIER" },

  { route: "GET /api/v1/inventory", access: "OWNER,MANAGER" },
  { route: "GET /api/v1/inventory/history", access: "OWNER,MANAGER" },
  { route: "POST /api/v1/inventory/adjust", access: "OWNER,MANAGER", body: true },

  { route: "GET /api/v1/customers", access: "any" },
  { route: "GET /api/v1/customers/:id", access: "any" },
  { route: "GET /api/v1/customers/:id/orders", access: "any" },
  { route: "POST /api/v1/customers", access: "any", body: true },
  { route: "PUT /api/v1/customers/:id", access: "any", body: true },
  { route: "DELETE /api/v1/customers/:id", access: "OWNER,MANAGER" },

  { route: "GET /api/v1/reports/sales", access: "OWNER,MANAGER" },
  { route: "GET /api/v1/reports/profit", access: "OWNER,MANAGER" },
  { route: "GET /api/v1/reports/products", access: "OWNER,MANAGER" },
  { route: "GET /api/v1/reports/categories", access: "OWNER,MANAGER" },
  { route: "GET /api/v1/reports/payments", access: "OWNER,MANAGER" },
  { route: "GET /api/v1/reports/export", access: "OWNER,MANAGER" },

  { route: "GET /api/v1/staff", access: "OWNER" },
  { route: "POST /api/v1/staff", access: "OWNER", body: true },
  { route: "PUT /api/v1/staff/:id", access: "OWNER", body: true },
  { route: "PATCH /api/v1/staff/:id/status", access: "OWNER", body: true },
  { route: "POST /api/v1/staff/:id/reset-password", access: "OWNER" },
  { route: "DELETE /api/v1/staff/:id", access: "OWNER" },

  { route: "GET /api/v1/settings/app", access: "any" },
  { route: "GET /api/v1/settings", access: "OWNER" },
  { route: "PUT /api/v1/settings/shop", access: "OWNER", body: true },
  { route: "PUT /api/v1/settings/billing", access: "OWNER", body: true },
  { route: "PUT /api/v1/settings/receipt", access: "OWNER", body: true },

  { route: "GET /api/v1/account", access: "any" },
  { route: "PUT /api/v1/account/profile", access: "any", body: true },
  { route: "POST /api/v1/account/change-password", access: "any", body: true },
];

const ROLES: Role[] = ["OWNER", "MANAGER", "CASHIER"];
const allowedRoles = (access: Access): Role[] =>
  access === "public" || access === "any" ? ROLES : (access.split(",") as Role[]);

// ---------- the routes that really exist, found by reading the source ----------

function read(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

function declaredEndpoints(): string[] {
  const appSource = read("src/app.ts");
  const routeFiles = fs
    .readdirSync(path.resolve(process.cwd(), "src/routes"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({ file, source: read(`src/routes/${file}`) }));

  const found: string[] = [];

  for (const mount of appSource.matchAll(/app\.use\(\s*"([^"]+)"\s*,\s*(\w+)\s*\)/g)) {
    const [, base, name] = mount;
    const file = routeFiles.find((f) => new RegExp(`export const ${name}\\s*=\\s*Router\\(`).test(f.source));
    if (!file) continue;

    for (const route of file.source.matchAll(new RegExp(`${name}\\.(get|post|put|patch|delete)\\(\\s*"([^"]*)"`, "g"))) {
      found.push(`${route[1].toUpperCase()} ${base}${route[2] === "/" ? "" : route[2]}`);
    }
  }

  for (const direct of appSource.matchAll(/app\.(get|post|put|patch|delete)\(\s*"(\/api[^"]*)"/g)) {
    found.push(`${direct[1].toUpperCase()} ${direct[2]}`);
  }
  return found;
}

// ---------- helpers ----------

const SHOP = "11111111-1111-4111-8111-111111111111";
const IDS: Record<Role | "DISABLED", string> = {
  OWNER: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  MANAGER: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  CASHIER: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  DISABLED: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};
const SOME_ID = "3f2b8c1e-5d4a-4b6e-9a7c-1d2e3f4a5b6c";

const tokenFor = (role: Role) => signAccessToken({ id: IDS[role], shopId: SHOP, role });

function send(rule: Rule, bearer?: string, body?: unknown) {
  const [method, rawPath] = rule.route.split(" ");
  const url = rawPath.replace(/:\w+/g, SOME_ID);
  let req = (request(app) as any)[method.toLowerCase()](url);
  if (bearer) req = req.set("Authorization", `Bearer ${bearer}`);
  if (body !== undefined) req = req.send(body);
  return req;
}

const codeOf = (res: any): string | undefined => res.body?.error?.code;
const TIMEOUT = 60_000;

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  for (const role of ROLES) mocks.users.set(IDS[role], { id: IDS[role], shopId: SHOP, role, isActive: true });
  mocks.users.set(IDS.DISABLED, { id: IDS.DISABLED, shopId: SHOP, role: "OWNER", isActive: false });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("the list of routes", () => {
  it("has a decision for every route, and no entry for a route that does not exist", () => {
    expect(declaredEndpoints().sort()).toEqual(RULES.map((rule) => rule.route).sort());
  });

  it("never uses .all(), which would answer every method", () => {
    const files = fs.readdirSync(path.resolve(process.cwd(), "src/routes")).map((file) => read(`src/routes/${file}`));
    expect(files.some((source) => /Router\.all\(/.test(source))).toBe(false);
  });
});

describe("who can get in", () => {
  const protectedRules = RULES.filter((rule) => rule.access !== "public");

  it("strangers are turned away from every protected route", async () => {
    const wrong: string[] = [];
    for (const rule of protectedRules) {
      const res = await send(rule);
      if (res.status !== 401 || codeOf(res) !== "UNAUTHENTICATED") wrong.push(`${rule.route} -> ${res.status} ${codeOf(res)}`);
    }
    expect(wrong).toEqual([]);
  }, TIMEOUT);

  it("public routes do not ask for a login", async () => {
    const wrong: string[] = [];
    for (const rule of RULES.filter((r) => r.access === "public")) {
      const res = await send(rule);
      if (res.status === 403 || codeOf(res) === "UNAUTHENTICATED") wrong.push(`${rule.route} -> ${res.status} ${codeOf(res)}`);
    }
    expect(wrong).toEqual([]);
  }, TIMEOUT);

  for (const role of ROLES) {
    it(`${role}: allowed where intended, refused everywhere else`, async () => {
      const wrong: string[] = [];
      for (const rule of protectedRules) {
        const res = await send(rule, tokenFor(role));
        const allowed = allowedRoles(rule.access).includes(role);
        const code = codeOf(res);
        const ok = allowed
          ? res.status !== 401 && res.status !== 403 && code !== "UNAUTHENTICATED" && code !== "FORBIDDEN"
          : res.status === 403 && code === "FORBIDDEN";
        if (!ok) wrong.push(`${rule.route} as ${role}: expected ${allowed ? "access" : "403"}, got ${res.status} ${code}`);
      }
      expect(wrong).toEqual([]);
    }, TIMEOUT);
  }
});

describe("tokens", () => {
  const url = "/api/v1/dashboard";
  const future = () => Math.floor(Date.now() / 1000) + 600;
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const secret = process.env.JWT_ACCESS_SECRET as string;

  async function status(bearer?: string, scheme = "Bearer") {
    const req = request(app).get(url);
    return bearer === undefined ? req : req.set("Authorization", `${scheme} ${bearer}`);
  }

  it("accepts a good token", async () => {
    expect((await status(tokenFor("OWNER"))).status).not.toBe(401);
  });

  it("refuses missing, broken and wrongly signed tokens", async () => {
    expect((await request(app).get(url).set("Authorization", "Bearer")).status).toBe(401);
    expect((await status("not-a-token")).status).toBe(401);
    expect((await status("abc", "Basic")).status).toBe(401);

    const claims = { shopId: SHOP, role: "OWNER" };
    expect((await status(jwt.sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 60 }, secret, { subject: IDS.OWNER }))).status).toBe(401);
    expect((await status(jwt.sign(claims, "x".repeat(40), { subject: IDS.OWNER, expiresIn: 600 }))).status).toBe(401);
    // Only HS256 is accepted, even with the right secret
    expect((await status(jwt.sign(claims, secret, { subject: IDS.OWNER, expiresIn: 600, algorithm: "HS512" }))).status).toBe(401);
    // A token that claims to need no signature at all
    const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: IDS.OWNER, ...claims, exp: future() })}.`;
    expect((await status(unsigned)).status).toBe(401);
  });

  it("refuses a valid token for a disabled or deleted account", async () => {
    expect((await status(signAccessToken({ id: IDS.DISABLED, shopId: SHOP, role: "OWNER" }))).status).toBe(401);
    expect((await status(signAccessToken({ id: SOME_ID, shopId: SHOP, role: "OWNER" }))).status).toBe(401);
  });

  it("uses the role from the database, never the role written in the token", async () => {
    const forged = signAccessToken({ id: IDS.CASHIER, shopId: SHOP, role: "OWNER" });
    const res = await request(app).get("/api/v1/staff").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(403);
    expect(codeOf(res)).toBe("FORBIDDEN");
  });
});

describe("input checks", () => {
  const withBody = RULES.filter((rule) => rule.body);

  it("every route that takes data refuses an empty request cleanly, never with a crash", async () => {
    const wrong: string[] = [];
    for (const rule of withBody) {
      const bearer = rule.access === "public" ? undefined : tokenFor(allowedRoles(rule.access)[0]);
      const res = await send(rule, bearer, {});
      if (res.status !== 400 || codeOf(res) !== "VALIDATION_ERROR") wrong.push(`${rule.route} -> ${res.status} ${codeOf(res)}`);
    }
    expect(wrong).toEqual([]);
  }, TIMEOUT);

  it("handles a body that is not JSON, and one that is broken", async () => {
    const plain = await request(app).post("/api/v1/auth/login").set("Content-Type", "text/plain").send("identifier=a&password=b");
    expect(plain.status).toBe(400);
    expect(codeOf(plain)).toBe("VALIDATION_ERROR");

    const broken = await request(app).post("/api/v1/auth/login").set("Content-Type", "application/json").send("{bad json");
    expect(broken.status).toBe(400);
    expect(codeOf(broken)).toBe("BAD_JSON");
  });

  it("refuses a huge request with 413", async () => {
    const huge = JSON.stringify({ identifier: "x", password: "a".repeat(2_000_000) });
    const res = await request(app).post("/api/v1/auth/login").set("Content-Type", "application/json").send(huge);
    expect(res.status).toBe(413);
    expect(codeOf(res)).toBe("PAYLOAD_TOO_LARGE");
  });

  it("answers unknown addresses with a plain JSON 404", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(codeOf(res)).toBe("NOT_FOUND");
  });
});

describe("headers and CORS", () => {
  const ORIGIN = "http://localhost:5173";

  it("sets the protective headers on every API response", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["referrer-policy"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  it("never stores a login response", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({});
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("lets our own website read responses, with its cookie", async () => {
    const res = await request(app).get("/api/v1/health").set("Origin", ORIGIN);
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("gives other websites no CORS headers at all", async () => {
    for (const origin of ["http://evil.example", "https://localhost:5173", "http://localhost:5174", "null"]) {
      const res = await request(app).get("/api/v1/health").set("Origin", origin);
      expect(res.headers["access-control-allow-origin"], origin).toBeUndefined();
      expect(res.headers["access-control-allow-credentials"], origin).toBeUndefined();
    }
  });

  it("answers the browser's pre-check only for our own website, with a fixed list of methods and headers", async () => {
    const good = await request(app)
      .options("/api/v1/products")
      .set("Origin", ORIGIN)
      .set("Access-Control-Request-Method", "PATCH")
      .set("Access-Control-Request-Headers", "authorization,content-type");
    expect(good.status).toBe(204);
    expect(good.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(good.headers["access-control-allow-methods"]).toContain("PATCH");
    expect(good.headers["access-control-allow-headers"]).toContain("Authorization");

    const bad = await request(app)
      .options("/api/v1/products")
      .set("Origin", "http://evil.example")
      .set("Access-Control-Request-Method", "DELETE");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("in production, the cookie routes refuse requests from another website", async () => {
    const before = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      for (const route of ["/api/v1/auth/refresh", "/api/v1/auth/logout"]) {
        const evil = await request(app).post(route).set("Origin", "http://evil.example");
        expect(evil.status, route).toBe(403);
        expect(codeOf(evil), route).toBe("BAD_ORIGIN");
      }
      // Our own website, and a plain request with no Origin (curl), are not stopped by this check
      const own = await request(app).post("/api/v1/auth/refresh").set("Origin", env.CORS_ORIGIN);
      expect(own.status).toBe(401);
      expect(codeOf(own)).toBe("SESSION_EXPIRED");
      const none = await request(app).post("/api/v1/auth/refresh");
      expect(codeOf(none)).toBe("SESSION_EXPIRED");
    } finally {
      env.NODE_ENV = before;
    }
  });
});
