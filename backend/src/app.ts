import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { errorHandler, notFound } from "./middleware/errorHandler";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

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

// These two must stay LAST
app.use(notFound);
app.use(errorHandler);
