/**
 * Shrinks a chart photo before upload: upright (EXIF), at most 2048px on the
 * long edge, JPEG. Keeps requests well under the 4.5 MB function limit and
 * strips the camera's metadata (location, device) along the way.
 */
const LONG_EDGE = 2048;

export async function preparePhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
        ? "This browser can't open HEIC photos. Set your camera to “Most Compatible” or upload from your phone."
        : "That file isn't a photo this browser can open.",
    );
  }
  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare photos.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare the photo."))), "image/jpeg", 0.86),
  );
}
