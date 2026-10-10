import path from "path";

// Uploaded images are saved in this folder.
// In production this needs a persistent disk or cloud storage.
export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// The only image addresses the app accepts: /uploads/<random-id>.jpg|png|webp
const UPLOAD_URL_RE =
  /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function isUploadUrl(value: string): boolean {
  return UPLOAD_URL_RE.test(value);
}
