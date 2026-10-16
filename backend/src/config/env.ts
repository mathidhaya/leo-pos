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

// An empty value in the .env file ("SMTP_HOST=") means "not set"
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),
    CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
    JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
    // How many reverse proxies (nginx, Caddy, a load balancer) sit in front of this server. 0 = none.
    // Needed so rate limits see each visitor's real address instead of the proxy's.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    // Set to "false" once your cafe is registered, so strangers cannot create cafes on your server
    ALLOW_REGISTRATION: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),

    // Sending OTP codes by email (any SMTP service)
    SMTP_HOST: optionalText,
    SMTP_PORT: z.preprocess(
      (value) => (value === "" || value === undefined ? undefined : value),
      z.coerce.number().int().min(1).max(65535).default(587)
    ),
    SMTP_USER: optionalText,
    SMTP_PASS: optionalText,
    SMTP_FROM: optionalText,

    // Sending OTP codes by SMS (Twilio)
    TWILIO_ACCOUNT_SID: optionalText,
    TWILIO_AUTH_TOKEN: optionalText,
    TWILIO_FROM: optionalText,
  })
  .superRefine((value, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    if (value.JWT_ACCESS_SECRET && value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      add("JWT_REFRESH_SECRET", "JWT_REFRESH_SECRET must be different from JWT_ACCESS_SECRET.");
    }

    const problem = originProblem(value.CORS_ORIGIN);
    if (problem) add("CORS_ORIGIN", problem);

    // Email: the server and the sender address go together, and so do the user name and password
    const smtpPair = [value.SMTP_HOST, value.SMTP_FROM];
    if (smtpPair.some(Boolean) && !smtpPair.every(Boolean)) {
      add("SMTP_HOST", "SMTP_HOST and SMTP_FROM must be set together.");
    }
    if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASS)) {
      add("SMTP_USER", "SMTP_USER and SMTP_PASS must be set together.");
    }
    if (value.SMTP_FROM && !value.SMTP_FROM.includes("@")) {
      add("SMTP_FROM", "SMTP_FROM must contain an email address, for example Leo Cafe <no-reply@example.com>.");
    }

    // SMS: all three or none
    const twilio = [value.TWILIO_ACCOUNT_SID, value.TWILIO_AUTH_TOKEN, value.TWILIO_FROM];
    if (twilio.some(Boolean) && !twilio.every(Boolean)) {
      add("TWILIO_ACCOUNT_SID", "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM must be set together.");
    }
    if (value.TWILIO_ACCOUNT_SID && !/^AC[0-9a-fA-F]{32}$/.test(value.TWILIO_ACCOUNT_SID)) {
      add("TWILIO_ACCOUNT_SID", "TWILIO_ACCOUNT_SID should start with AC and be 34 characters long.");
    }

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
