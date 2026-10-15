import { execSync } from "child_process";
import pg from "pg";

const { Client } = pg;

// Runs once before all the integration tests: checks the database is really a test database,
// then brings it up to date with the latest migrations.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set in backend/.env. Run:  npm run db:test:create");
  }

  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!/_test$/.test(name)) {
    throw new Error(`Refusing to run: the database "${name}" does not end in _test.`);
  }
  if (process.env.DATABASE_URL && url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must not be the same as DATABASE_URL.");
  }

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Cannot connect to the test database "${name}". Is PostgreSQL running? Did you run  npm run db:test:create ?\n(${
        err instanceof Error ? err.message : err
      })`
    );
  }
  await client.end();

  try {
    execSync("npx prisma migrate deploy", {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
  } catch (err) {
    const output = err as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`Could not prepare the test database.\n${output.stdout ?? ""}\n${output.stderr ?? ""}`);
  }
}
