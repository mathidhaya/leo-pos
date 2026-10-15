// Runs before every integration test file. A last safety check, in case a test file is run with the wrong settings.
const url = process.env.DATABASE_URL ?? "";
let name = "";
try {
  name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
} catch {
  // not a valid address
}
if (!/_test$/.test(name)) {
  throw new Error(`Integration tests must run against a database whose name ends in _test (got "${name}").`);
}
