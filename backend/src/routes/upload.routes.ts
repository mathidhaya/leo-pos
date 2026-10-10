import { Router } from "express";
import multer from "multer";
import { MAX_IMAGE_BYTES } from "../config/uploads";
import * as controller from "../controllers/upload.controller";
import { authenticate, requireRole } from "../middleware/auth";

export const uploadRouter = Router();

// The file is held in memory so we can check what it really is before saving anything
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

uploadRouter.post(
  "/image",
  authenticate,
  requireRole("OWNER", "MANAGER"),
  upload.single("image"),
  controller.uploadImage
);
