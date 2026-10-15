import "dotenv/config";
import fs from "fs";
import path from "path";
import pg from "pg";

const { Client } = pg;

const nameOf = (url: string) => decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));

// Creates the test database next to your development one, and adds TEST_DATABASE_URL to backend/.env.
// The password is reused from DATABASE_URL and never printed.
async function main() {
  const dev = process.env.DATABASE_URL;
  if (!dev) throw new Error("DATABASE_URL is missing in backend/.env");
  const devName = nameOf(dev);

  let testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    const u = new URL(dev);
    u.pathname = `/${devName}_test`;
    testUrl = u.toString();
  }

  const testName = nameOf(testUrl);
  if (!/^[A-Za-z0-9_]+_test$/.test(testName)) {
    throw new Error(`The test database name must end in _test (got "${testName}").`);
  }
  if (testName === devName) throw new Error("The test database must be a different database from the development one.");

  const client = new Client({ connectionString: dev });
  await client.connect();
  try {
    const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [testName]);
    if (found.rowCount === 0) {
      await client.query(`CREATE DATABASE "${testName}"`);
      console.log(`Created the database "${testName}".`);
    } else {
      console.log(`The database "${testName}" already exists.`);
    }
  } finally {
    await client.end();
  }

  const envFile = path.resolve(process.cwd(), ".env");
  const text = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  if (/^TEST_DATABASE_URL=/m.test(text)) {
    console.log("TEST_DATABASE_URL is already in backend/.env.");
  } else {
    fs.appendFileSync(envFile, `${text === "" || text.endsWith("\n") ? "" : "\n"}TEST_DATABASE_URL=${testUrl}\n`);
    console.log("Added TEST_DATABASE_URL to backend/.env.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
