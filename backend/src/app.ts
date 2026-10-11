import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { prisma } from "./config/db";
import { UPLOAD_DIR } from "./config/uploads";
import { errorHandler, notFound } from "./middleware/errorHandler";
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
import { staffRouter } from "./routes/staff.routes";
import { uploadRouter } from "./routes/upload.routes";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
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

app.get("/api/v1/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      service: "leo-pos-api",
      time: new Date().toISOString(),
    },
  });
});

app.get("/api/v1/health/db", async (_req, res, next) => {
  try {
    const [shops, products] = await Promise.all([prisma.shop.count(), prisma.product.count()]);
    res.json({ success: true, data: { database: "connected", shops, products } });
  } catch (err) {
    next(err);
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

// These two must stay LAST
app.use(notFound);
app.use(errorHandler);
