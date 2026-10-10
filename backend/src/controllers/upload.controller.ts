import type { RequestHandler } from "express";
import { saveImage } from "../services/upload.service";
import { AppError } from "../utils/AppError";

export const uploadImage: RequestHandler = async (req, res) => {
  if (!req.file) {
    throw new AppError(400, "NO_FILE", "Please choose an image to upload.");
  }
  const url = await saveImage(req.file.buffer);
  res.status(201).json({ success: true, data: { url } });
};
