import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { UPLOAD_DIR, isUploadUrl } from "../config/uploads";
import { AppError } from "../utils/AppError";

// We look at the first bytes of the file to find out what it really is.
// The file name and the type sent by the browser can be faked.
function detectImageType(buf: Buffer): "jpg" | "png" | "webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png";
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export async function saveImage(buf: Buffer): Promise<string> {
  const ext = detectImageType(buf);
  if (!ext) {
    throw new AppError(400, "INVALID_IMAGE", "Please upload a JPG, PNG or WebP image.");
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), buf, { flag: "wx" });
  return `/uploads/${name}`;
}

// Removes an image we saved earlier. Never throws: a missing file is not a problem.
export async function deleteUploadedImage(url: string | null | undefined): Promise<void> {
  if (!url || !isUploadUrl(url)) return;
  try {
    await fs.unlink(path.join(UPLOAD_DIR, path.basename(url)));
  } catch {
    // already gone
  }
}
