import type { RequestHandler } from "express";
import type { z } from "zod";

// Checks req.body against a Zod schema. Unknown fields are dropped.
// Validation errors are turned into a friendly 400 by errorHandler.
export const validateBody =
  (schema: z.ZodType): RequestHandler =>
  (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
