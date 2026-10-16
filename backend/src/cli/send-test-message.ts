import { emailEnabled, sendTestMessage, smsEnabled } from "../services/notification.service";
import { AppError } from "../utils/AppError";
import { parseIdentifier } from "../utils/identifier";

const out = (text = "") => process.stdout.write(`${text}\n`);

async function main(): Promise<void> {
  const target = process.argv[2];
  const id = target ? parseIdentifier(target) : null;
  if (!id) {
    out("Usage: send-test-message <email address or 10-digit mobile number>");
    process.exitCode = 1;
    return;
  }

  out(`Email sending is ${emailEnabled() ? "configured" : "NOT configured"}.`);
  out(`SMS sending is ${smsEnabled() ? "configured" : "NOT configured"}.`);
  out(`Sending a test message to ${id.value} ...`);

  await sendTestMessage(id);
  out("Sent. Check the inbox (and the spam folder).");
}

main().catch((err) => {
  process.stderr.write(`\nNot sent: ${err instanceof AppError ? err.message : "something went wrong."}\n`);
  process.stderr.write("The reason is in the lines above, if any (for example a wrong password or port).\n");
  process.exitCode = 1;
});
