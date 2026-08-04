// ============================================================================
// Employee photo upload — drag & drop, click-to-browse, preview, replace, remove.
//
// Client-side limits mirror Backend/src/common/upload/image-upload.ts (2 MB,
// jpeg/png/webp/gif). The server re-checks both, and additionally verifies the
// file's magic bytes against its declared type, so this component's checks are
// purely to fail fast without a wasted round trip.
//
// Two modes, because create and edit are genuinely different problems:
//   - Deferred (no `employeeId`): the file is held in memory and handed to the
//     parent via `onFileSelected`, which uploads it after the employee exists.
//     There is no id to attach a photo to before the POST succeeds.
//   - Immediate (`employeeId` given): the file is uploaded straight away and the
//     stored path is reported through `onUploaded`.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, Upload, UserRound } from "lucide-react";

import { ApiError } from "@/lib/apiClient";
import { employeeService, myProfileService } from "@/modules/employees/api/employeeService";

/** 2 MB — the backend's MAX_PHOTO_BYTES. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const ACCEPT_ATTR = ALLOWED_IMAGE_TYPES.join(",");

/** Human-readable size, for the error message. */
const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Validates a chosen file before any upload is attempted.
 *
 * Returns a message rather than throwing so the caller can render it inline;
 * a rejected file is normal user input, not an exceptional condition.
 */
export function validatePhotoFile(file: File): string | undefined {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as never)) {
    return "Choose a JPEG, PNG, WebP or GIF image.";
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `Image is too large (${formatMb(file.size)}). The maximum is ${formatMb(MAX_PHOTO_BYTES)}.`;
  }
  if (file.size === 0) {
    return "That file is empty.";
  }
  return undefined;
}

type PhotoUploadProps = {
  /** Currently stored photo, already resolved to a loadable URL. */
  currentUrl?: string;
  /**
   * Employee to upload for. Omit on the create form — the file is then held
   * and handed back through `onFileSelected` instead.
   */
  employeeId?: string;
  /** Target the `me/photo` self-service routes rather than `:id/photo`. */
  self?: boolean;
  /** Deferred mode: the validated file, or null when the user removes it. */
  onFileSelected?: (file: File | null) => void;
  /** Immediate mode: the stored `profile_image` path, or null after removal. */
  onUploaded?: (profileImage: string | null) => void;
  disabled?: boolean;
  /** Rendered diameter. The image is always square and centre-cropped. */
  size?: number;
};

export default function PhotoUpload({
  currentUrl,
  employeeId,
  self = false,
  onFileSelected,
  onUploaded,
  disabled = false,
  size = 128,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Local object-URL preview, used in deferred mode and as an optimistic
  // preview in immediate mode.
  const [previewUrl, setPreviewUrl] = useState<string>();
  /** Set when the user removes an existing photo but hasn't saved yet. */
  const [cleared, setCleared] = useState(false);

  // Object URLs are a leak if never revoked — the browser holds the blob alive
  // for the document's lifetime otherwise.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const shown = previewUrl ?? (cleared ? undefined : currentUrl);
  const immediate = Boolean(employeeId) || self;

  const accept = useCallback(
    async (file: File) => {
      const message = validatePhotoFile(file);
      if (message) {
        setError(message);
        return;
      }

      setError(undefined);
      setCleared(false);

      // Revoke the previous preview before replacing it, or repeated
      // "replace" clicks accumulate blobs.
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));

      if (!immediate) {
        onFileSelected?.(file);
        return;
      }

      setBusy(true);
      try {
        const updated = self
          ? await myProfileService.uploadPhoto(file)
          : await employeeService.uploadPhoto(employeeId!, file);
        onUploaded?.(updated.profile_image ?? null);
      } catch (uploadError) {
        // Roll the preview back: leaving it would show a photo that isn't
        // actually stored, which the next reload would silently contradict.
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(undefined);
        setError(
          uploadError instanceof ApiError
            ? uploadError.message
            : "Could not upload the photo. Please try again.",
        );
      } finally {
        setBusy(false);
      }
    },
    [employeeId, immediate, onFileSelected, onUploaded, previewUrl, self],
  );

  const remove = useCallback(async () => {
    setError(undefined);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(undefined);
    if (inputRef.current) inputRef.current.value = "";

    if (!immediate) {
      setCleared(true);
      onFileSelected?.(null);
      return;
    }

    setBusy(true);
    try {
      self
        ? await myProfileService.removePhoto()
        : await employeeService.removePhoto(employeeId!);
      setCleared(true);
      onUploaded?.(null);
    } catch (removeError) {
      setError(
        removeError instanceof ApiError
          ? removeError.message
          : "Could not remove the photo. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [employeeId, immediate, onFileSelected, onUploaded, previewUrl, self]);

  const interactive = !disabled && !busy;

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!interactive) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void accept(file);
  };

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5">
      {/* Drop zone doubles as the preview. A button, not a div, so it is
          keyboard-reachable and announces itself correctly. */}
      <button
        type="button"
        onClick={() => interactive && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (interactive) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={!interactive}
        aria-label={shown ? "Replace photo" : "Upload photo"}
        style={{ width: size, height: size }}
        className={`group relative shrink-0 overflow-hidden rounded-2xl border-2 border-dashed transition ${
          dragging
            ? "border-brand bg-brand-light/40"
            : "border-gray-200 bg-gray-50 hover:border-brand/60 hover:bg-brand-light/20"
        } ${!interactive ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        {shown ? (
          <>
            <img src={shown} alt="Employee photo" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-gray-900/0 text-white opacity-0 transition group-hover:bg-gray-900/45 group-hover:opacity-100">
              <Camera size={20} />
            </span>
          </>
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2 text-center text-gray-400">
            <UserRound size={size > 96 ? 30 : 22} />
            <span className="text-[11px] font-medium leading-tight">
              Drag &amp; drop
              <br />or click
            </span>
          </span>
        )}

        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 size={22} className="animate-spin text-brand-dark" />
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

      <div className="min-w-0 flex-1 text-center sm:text-left">
        <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
          <button
            type="button"
            onClick={() => interactive && inputRef.current?.click()}
            disabled={!interactive}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-brand/60 hover:bg-brand-light/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload size={14} />
            {shown ? "Replace" : "Upload photo"}
          </button>

          {shown && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={!interactive}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={14} />
              Remove
            </button>
          )}
        </div>

        <p className="mt-2 text-xs text-gray-500">
          JPEG, PNG, WebP or GIF · up to {formatMb(MAX_PHOTO_BYTES)}
        </p>

        {error && (
          <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
