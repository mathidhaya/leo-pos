import path from "path";

// Uploaded images are saved in this folder.
// In production this needs a persistent disk or cloud storage.
export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// The only image addresses the app accepts: /uploads/<random-id>.jpg|png|webp
const UPLOAD_URL_RE =
  /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

// Images stored in Cloudinary: https://res.cloudinary.com/<cloud>/image/upload/v<number>/leo-pos/<random-id>.jpg|png|webp
const CLOUD_URL_RE =
  /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/v\d+\/leo-pos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function isCloudUrl(value: string): boolean {
  return CLOUD_URL_RE.test(value);
}

export function isUploadUrl(value: string): boolean {
  return UPLOAD_URL_RE.test(value) || CLOUD_URL_RE.test(value);
}
