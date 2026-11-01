export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/** Upload types we accept, and the file extension each is stored with. */
export const UPLOAD_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export function mediaKind(mimeType: string) {
  return mimeType.startsWith("video/") ? "VIDEO" : "IMAGE";
}
