import "dotenv/config";
import { defineConfig } from "vitest/config";

// The integration tests run the real app against the TEST database (TEST_DATABASE_URL in backend/.env).
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.int.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/globalSetup.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      JWT_ACCESS_SECRET: "integration-access-secret-0123456789-abcdefghij",
      JWT_REFRESH_SECRET: "integration-refresh-secret-9876543210-jihgfedcba",
      CORS_ORIGIN: "http://localhost:5173",
      ALLOW_REGISTRATION: "true",
    },
  },
});
