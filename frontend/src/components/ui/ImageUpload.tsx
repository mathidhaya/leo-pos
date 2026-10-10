import { useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { uploadImage } from "../../api/uploads";
import { getErrorMessage } from "../../utils/errors";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

interface Props {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  onUploadingChange?: (uploading: boolean) => void;
}

export default function ImageUpload({ label, value, onChange, onUploadingChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);

    // Quick checks here save a round trip. The server checks again.
    if (!TYPES.includes(file.type)) {
      setError("Please choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("The image is too large. The maximum size is 2 MB.");
      return;
    }

    setUploading(true);
    onUploadingChange?.(true);
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
      <div className="flex items-center gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50 text-gray-400">
          {uploading ? (
            <LoaderCircle className="h-6 w-6 animate-spin" aria-label="Uploading" />
          ) : value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-7 w-7" aria-hidden="true" />
          )}
        </div>

        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            id="image-upload-input"
            onChange={(e) => handleFile(e.target.files?.[0])}
            disabled={uploading}
          />
          <label
            htmlFor="image-upload-input"
            className={[
              "inline-flex h-10 cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50",
              uploading ? "pointer-events-none opacity-60" : "",
            ].join(" ")}
          >
            {value ? "Change image" : "Choose image"}
          </label>
          {value && !uploading && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </button>
          )}
          <p className="text-xs text-gray-500">JPG, PNG or WebP, up to 2 MB.</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
