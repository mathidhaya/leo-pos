import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { env } from "../config/env";
import { UPLOAD_DIR, isCloudUrl, isUploadUrl } from "../config/uploads";
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

const cloudEnabled = (): boolean =>
  Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

// Cloudinary signs a request by hashing the sorted parameters plus the API secret
function sign(params: Record<string, string>): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(toSign + env.CLOUDINARY_API_SECRET).digest("hex");
}

async function saveToCloud(buf: Buffer, ext: string): Promise<string> {
  const publicId = `leo-pos/${crypto.randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)]), `image.${ext}`);
  form.append("public_id", publicId);
  form.append("timestamp", timestamp);
  form.append("api_key", env.CLOUDINARY_API_KEY as string);
  form.append("signature", sign({ public_id: publicId, timestamp }));

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => null)) as { secure_url?: string; error?: { message?: string } } | null;
    if (!res.ok || !data?.secure_url || !isCloudUrl(data.secure_url)) {
      console.error("Image upload failed:", res.status, data?.error?.message ?? "unexpected response");
      throw new AppError(503, "IMAGE_UPLOAD_FAILED", "We could not save the image. Please try again.");
    }
    return data.secure_url;
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error("Image upload failed:", err instanceof Error ? err.name : "unknown error");
    throw new AppError(503, "IMAGE_UPLOAD_FAILED", "We could not save the image. Please try again.");
  }
}

async function deleteFromCloud(url: string): Promise<void> {
  const match = /\/upload\/v\d+\/(leo-pos\/[^.]+)\./.exec(url);
  if (!match) return;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const form = new URLSearchParams({
    public_id: match[1],
    timestamp,
    api_key: env.CLOUDINARY_API_KEY as string,
    signature: sign({ public_id: match[1], timestamp }),
  });
  try {
    await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // not a problem: the record is already updated
  }
}

export async function saveImage(buf: Buffer): Promise<string> {
  const ext = detectImageType(buf);
  if (!ext) {
    throw new AppError(400, "INVALID_IMAGE", "Please upload a JPG, PNG or WebP image.");
  }

  if (cloudEnabled()) return saveToCloud(buf, ext);

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), buf, { flag: "wx" });
  return `/uploads/${name}`;
}

// Removes an image we saved earlier. Never throws: a missing file is not a problem.
export async function deleteUploadedImage(url: string | null | undefined): Promise<void> {
  if (!url || !isUploadUrl(url)) return;
  if (isCloudUrl(url)) {
    if (cloudEnabled()) await deleteFromCloud(url);
    return;
  }
  try {
    await fs.unlink(path.join(UPLOAD_DIR, path.basename(url)));
  } catch {
    // already gone
  }
}
