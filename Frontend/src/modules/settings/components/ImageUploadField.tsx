// ============================================================================
// Image field for company settings — upload button, preview, remove.
//
// Replaces the plain "paste a URL" text input the branding screen used to have.
// Hosting an image somewhere public just to reference it here is a chore, and
// the URL breaks the moment that host goes away; uploading puts the file on the
// server that already serves every other upload.
//
// A URL is still accepted. The field stays editable, so an existing CDN logo
// keeps working and can be pasted as before — the upload button is an addition,
// not a replacement.
//
// Uploads are immediate, not deferred: unlike the employee photo, the row these
// columns live on always exists (company_settings is a single seeded row), so
// there is nothing to wait for. The server points the column at the new file
// and removes the one it replaced as part of the same call, which is why the
// parent doesn't need to save afterwards for the image to stick.
// ============================================================================

import { useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";

import { ApiError } from "@/lib/apiClient";
import {
  uploadCompanyAsset,
  type CompanyAssetKind,
} from "@/modules/settings/api/settingsApi";

/** 2 MB — the backend's MAX_BRANDING_BYTES, and the cap for signatures too. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * Types the branding endpoint accepts. SVG is absent deliberately, matching the
 * server: uploads are served unauthenticated from the API origin and an SVG can
 * carry script, so accepting one would let anyone who can change the logo run
 * script on that origin.
 */
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
] as const;

const ACCEPT_ATTR = [...ALLOWED_TYPES, ".ico"].join(",");

const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Checks a file before any upload is attempted. Returns a message rather than
 * throwing — a rejected file is normal input, not an exceptional condition. The
 * server re-checks all of this and additionally verifies the magic bytes, so
 * this is only here to fail fast without a wasted round trip.
 */
function validateFile(file: File): string | undefined {
  if (!ALLOWED_TYPES.includes(file.type as never)) {
    return "Choose a PNG, JPEG, WebP, GIF or ICO image.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Image is too large (${formatMb(file.size)}). The maximum is ${formatMb(MAX_UPLOAD_BYTES)}.`;
  }
  if (file.size === 0) return "That file is empty.";
  return undefined;
}

type ImageUploadFieldProps = {
  label: string;
  /** Which settings column this fills. Also decides where the file is stored. */
  kind: CompanyAssetKind;
  /** Current value — an uploaded URL or one typed by hand. */
  value: string;
  onChange: (url: string) => void;
  /** Shown under the field; explains what the image is for. */
  hint?: string;
  /** Preview box height in px. Signatures are wider and shorter than logos. */
  previewHeight?: number;
  disabled?: boolean;
};

export default function ImageUploadField({
  label,
  kind,
  value,
  onChange,
  hint,
  previewHeight = 80,
  disabled = false,
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  /** The URL failed to load — almost always a typo in a pasted address. */
  const [broken, setBroken] = useState(false);

  const interactive = !disabled && !busy;

  const accept = async (file: File) => {
    const message = validateFile(file);
    if (message) {
      setError(message);
      return;
    }

    setError(undefined);
    setBusy(true);
    try {
      const url = await uploadCompanyAsset(kind, file);
      setBroken(false);
      onChange(url);
    } catch (uploadError) {
      setError(
        uploadError instanceof ApiError
          ? uploadError.message
          : "Couldn't upload that image. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  /**
   * Clears the field only. The file itself is removed server-side when the
   * parent saves the empty value — deleting it here would strand the settings
   * row pointing at a file that no longer exists if the save is then abandoned.
   */
  const clear = () => {
    setError(undefined);
    setBroken(false);
    if (inputRef.current) inputRef.current.value = "";
    onChange("");
  };

  return (
    <div className="mb-5">
      <span className="mb-2 block text-[15px] font-medium text-gray-900">{label}</span>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* The preview doubles as the drop zone. A button so it is
            keyboard-reachable and announces itself correctly. */}
        <button
          type="button"
          onClick={() => interactive && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (interactive) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!interactive) return;
            const file = e.dataTransfer.files?.[0];
            if (file) void accept(file);
          }}
          disabled={!interactive}
          aria-label={value ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
          style={{ height: previewHeight }}
          className={`relative flex w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed p-2 transition sm:w-44 ${
            dragging
              ? "border-brand bg-brand-light/40"
              : "border-gray-200 bg-gray-50 hover:border-brand/60 hover:bg-brand-light/20"
          } ${!interactive ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        >
          {value && !broken ? (
            <img
              src={value}
              alt={`${label} preview`}
              className="max-h-full max-w-full object-contain"
              onError={() => setBroken(true)}
            />
          ) : (
            <span className="flex flex-col items-center gap-1 px-2 text-center text-gray-400">
              <ImageIcon size={18} />
              <span className="text-[11px] font-medium leading-tight">
                {broken ? "Couldn't load that image" : "Drag & drop or click"}
              </span>
            </span>
          )}

          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 size={20} className="animate-spin text-brand-dark" />
            </span>
          )}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so re-picking the same file fires `change` again.
            e.target.value = "";
            if (file) void accept(file);
          }}
        />

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => interactive && inputRef.current?.click()}
              disabled={!interactive}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-brand/60 hover:bg-brand-light/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload size={14} />
              {value ? "Replace image" : "Upload image"}
            </button>

            {value && (
              <button
                type="button"
                onClick={clear}
                disabled={!interactive}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={14} />
                Remove
              </button>
            )}
          </div>

          {/* Still editable: an image already hosted elsewhere can be pasted,
              which is how this field worked before uploading existed. */}
          <input
            type="url"
            value={value}
            disabled={!interactive}
            onChange={(e) => {
              setBroken(false);
              setError(undefined);
              onChange(e.target.value);
            }}
            placeholder="…or paste an image URL"
            spellCheck={false}
            className="w-full rounded-lg bg-gray-100 px-3.5 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:opacity-60"
          />

          <p className="mt-1.5 text-xs text-gray-500">
            {hint ? `${hint} · ` : ""}PNG, JPEG, WebP, GIF or ICO · up to {formatMb(MAX_UPLOAD_BYTES)}
          </p>

          {error && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
