import { createInterface } from "node:readline/promises";
import { prisma } from "../config/db";
import { createOwnerAccount } from "../services/owner.service";
import { AppError } from "../utils/AppError";

const out = (text = "") => process.stdout.write(`${text}\n`);

// Values can be given as --shop="..." --name="..." --login="..." instead of being asked
function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (question: string, given: string | undefined) => given ?? (await rl.question(question)).trim();

  try {
    out("Create the first owner of a new cafe.\n");
    const shopName = await ask("Cafe name: ", arg("shop"));
    const ownerName = await ask("Owner's name: ", arg("name"));
    const login = await ask("Owner's email or 10-digit mobile number: ", arg("login"));

    const created = await createOwnerAccount({ shopName, ownerName, identifier: login });

    out("\nDone. The owner account was created.\n");
    out(`  Login:              ${created.login}`);
    out(`  Temporary password: ${created.password}`);
    out("\nThis password is shown only once. Log in, then change it under Settings > Account.");
    out("Do not paste it into chats or tickets.");
  } finally {
    rl.close();
  }
}

main()
  .catch((err) => {
    process.stderr.write(`\n${err instanceof AppError ? err.message : "Something went wrong. The details are below."}\n`);
    if (!(err instanceof AppError)) console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
