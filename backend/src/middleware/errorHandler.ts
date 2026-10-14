import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "The requested resource was not found." },
  });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Please check the entered values.",
        details: err.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
    return;
  }

  // File upload problems (for example a file that is too large)
  if (err?.name === "MulterError") {
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    res.status(400).json({
      success: false,
      error: {
        code: tooBig ? "IMAGE_TOO_LARGE" : "UPLOAD_ERROR",
        message: tooBig
          ? "The image is too large. The maximum size is 2 MB."
          : "The image could not be uploaded. Please try again.",
      },
    });
    return;
  }

  if (err?.type === "entity.too.large") {
    res.status(413).json({
      success: false,
      error: { code: "PAYLOAD_TOO_LARGE", message: "The request is too large." },
    });
    return;
  }

  if (err?.type === "entity.parse.failed") {
    res.status(400).json({
      success: false,
      error: { code: "BAD_JSON", message: "Invalid request format." },
    });
    return;
  }

  // Anything unexpected is logged for us, and the person only sees a safe message.
  // The real error (a database message, a stack trace) never leaves the server.
  console.error(err);
  res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
  });
};
