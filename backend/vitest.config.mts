import { defineConfig } from "vitest/config";

// The fast tests. They never touch a database. (The integration tests have their own config.)
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "node_modules/**"],
    environment: "node",
  },
});
