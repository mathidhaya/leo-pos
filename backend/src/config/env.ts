import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

// A web address must be written exactly as the browser sends it: scheme + host (+ port), nothing else
function originProblem(origin: string): string | null {
  if (origin.includes("*")) return "CORS_ORIGIN must be one exact address, not a wildcard.";
  if (!/^https?:\/\//.test(origin)) return "CORS_ORIGIN must start with http:// or https://.";
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return "CORS_ORIGIN must be a web address such as https://app.example.com.";
  }
  if (url.origin !== origin) {
    return `CORS_ORIGIN must be written exactly as ${url.origin} (no trailing slash and no path).`;
  }
  return null;
}

// A real secret is random. These words mean someone forgot to replace an example value.
const PLACEHOLDER = /replace|change|example|placeholder|secret|password|12345/i;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),
    CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
    JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
    // How many reverse proxies (nginx, a load balancer) sit in front of this server. 0 = none.
    // Needed so rate limits see each visitor's real address instead of the proxy's.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    // Set to "false" once your cafe is registered, so strangers cannot create cafes on your server
    ALLOW_REGISTRATION: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
  })
  .superRefine((value, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    if (value.JWT_ACCESS_SECRET && value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      add("JWT_REFRESH_SECRET", "JWT_REFRESH_SECRET must be different from JWT_ACCESS_SECRET.");
    }

    const problem = originProblem(value.CORS_ORIGIN);
    if (problem) add("CORS_ORIGIN", problem);

    if (value.NODE_ENV === "production") {
      if (!value.CORS_ORIGIN.startsWith("https://")) add("CORS_ORIGIN", "In production CORS_ORIGIN must start with https://.");
      for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const) {
        if (PLACEHOLDER.test(value[key] ?? "")) add(key, `${key} still looks like a placeholder. Generate a random one.`);
      }
      if (/YOUR_PASSWORD/.test(value.DATABASE_URL ?? "")) add("DATABASE_URL", "DATABASE_URL still contains YOUR_PASSWORD.");
    }
  });

export type EnvResult =
  | { ok: true; env: z.infer<typeof envSchema> }
  | { ok: false; problems: string[] };

// Pure function, so the rules can be tested without touching the real environment
export function parseEnv(source: Record<string, string | undefined>): EnvResult {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return { ok: true, env: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`),
  };
}

const result = parseEnv(process.env);

if (!result.ok) {
  console.error("Invalid environment variables:");
  for (const problem of result.problems) console.error(`  - ${problem}`);
  process.exit(1);
}

export const env = result.env;
