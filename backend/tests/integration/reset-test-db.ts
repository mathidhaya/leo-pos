import "dotenv/config";
import pg from "pg";

const { Client } = pg;

// Empties every table in the TEST database (for example after a run that crashed halfway).
// It refuses to touch any database whose name does not end in _test.
async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set. Run: npm run db:test:create");

  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!/_test$/.test(name)) throw new Error(`Refusing to empty "${name}": a test database name must end in _test.`);
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must not be the same as DATABASE_URL.");

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const tables = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'"
    );
    if (tables.rowCount === 0) {
      console.log(`"${name}" has no tables yet. Nothing to empty.`);
      return;
    }
    const list = tables.rows.map((row: { tablename: string }) => `"${row.tablename}"`).join(", ");
    await client.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    console.log(`Emptied ${tables.rowCount} tables in "${name}".`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
