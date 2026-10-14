import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { prisma } from "./config/db";
import { UPLOAD_DIR } from "./config/uploads";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { apiLimiter, noStore } from "./middleware/security";
import { accountRouter } from "./routes/account.routes";
import { authRouter } from "./routes/auth.routes";
import { categoryRouter } from "./routes/category.routes";
import { customerRouter } from "./routes/customer.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { inventoryRouter } from "./routes/inventory.routes";
import { invoiceRouter } from "./routes/invoice.routes";
import { orderRouter } from "./routes/order.routes";
import { paymentRouter } from "./routes/payment.routes";
import { posRouter } from "./routes/pos.routes";
import { productRouter } from "./routes/product.routes";
import { reportRouter } from "./routes/report.routes";
import { settingsRouter } from "./routes/settings.routes";
import { staffRouter } from "./routes/staff.routes";
import { uploadRouter } from "./routes/upload.routes";

export const app = express();

// Behind a reverse proxy this makes rate limits see each visitor's real address (see TRUST_PROXY)
app.set("trust proxy", env.TRUST_PROXY);
app.disable("x-powered-by");

// This server only sends data and images, never web pages, so nothing on it may load anything else
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

// Only our own website may read responses. Other sites get no CORS headers at all.
app.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || origin === env.CORS_ORIGIN),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Uploaded images. Names are random, so they can be cached for a long time.
app.use(
  "/uploads",
  (_req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(UPLOAD_DIR, { maxAge: "7d", immutable: true, index: false, dotfiles: "deny" })
);

// Everything under /api is limited, and never stored by the browser
app.use("/api", apiLimiter, noStore);

app.get("/api/v1/health", (_req, res) => {
  res.json({
    success: true,
    data: { status: "ok", service: "leo-pos-api", time: new Date().toISOString() },
  });
});

// Says only whether the database answers. It no longer reveals how much data there is.
app.get("/api/v1/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, data: { database: "connected" } });
  } catch {
    res.status(503).json({
      success: false,
      error: { code: "DB_UNAVAILABLE", message: "The database is not reachable." },
    });
  }
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/dashboard", dashboardRouter);
app.use("/api/v1/categories", categoryRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/uploads", uploadRouter);
app.use("/api/v1/pos", posRouter);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/payments", paymentRouter);
app.use("/api/v1/invoices", invoiceRouter);
app.use("/api/v1/inventory", inventoryRouter);
app.use("/api/v1/customers", customerRouter);
app.use("/api/v1/reports", reportRouter);
app.use("/api/v1/staff", staffRouter);
app.use("/api/v1/settings", settingsRouter);
app.use("/api/v1/account", accountRouter);

// These two must stay LAST
app.use(notFound);
app.use(errorHandler);
