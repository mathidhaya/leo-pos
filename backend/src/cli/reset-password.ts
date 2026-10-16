import { createInterface } from "node:readline/promises";
import { prisma } from "../config/db";
import { resetPasswordByLogin } from "../services/owner.service";
import { AppError } from "../utils/AppError";

const out = (text = "") => process.stdout.write(`${text}\n`);

async function main(): Promise<void> {
  let login = process.argv[2];
  if (!login) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    login = (await rl.question("Email or 10-digit mobile number of the account: ")).trim();
    rl.close();
  }

  const result = await resetPasswordByLogin(login);

  out(`\nNew password for ${result.name} (${result.role.toLowerCase()}):`);
  out(`  Login:              ${result.login}`);
  out(`  Temporary password: ${result.password}`);
  out("\nThey were logged out everywhere. This password is shown only once.");
}

main()
  .catch((err) => {
    process.stderr.write(`\n${err instanceof AppError ? err.message : "Something went wrong. The details are below."}\n`);
    if (!(err instanceof AppError)) console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
