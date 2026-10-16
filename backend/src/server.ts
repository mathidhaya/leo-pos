import { app } from "./app";
import { prisma } from "./config/db";
import { env } from "./config/env";
import { emailEnabled, smsEnabled } from "./services/notification.service";

if (env.NODE_ENV === "production" && !emailEnabled() && !smsEnabled()) {
  console.warn("No email or SMS service is configured, so OTP codes cannot be sent (see docs/DEPLOYMENT.md).");
}

const server = app.listen(env.PORT, () => {
  console.log(`Leo POS API running on http://localhost:${env.PORT}`);
});

let stopping = false;

// Called when the server is told to stop (an update, a restart, Ctrl+C)
function stop(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received. Finishing the requests in progress, then stopping...`);

  // If something hangs, do not wait for ever
  setTimeout(() => process.exit(1), 10_000).unref();

  server.close(() => {
    prisma
      .$disconnect()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

// Anything unexpected is logged, then the process stops and the server software starts it again fresh
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});
