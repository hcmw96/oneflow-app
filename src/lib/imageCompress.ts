/**
 * If `file` is larger than `maxBytes`, re-encode as JPEG via canvas at decreasing quality.
 */
export async function compressImageIfNeeded(file: File, maxBytes = 1_000_000): Promise<Blob> {
  if (file.size <= maxBytes) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = url;
    });

    const maxW = 1600;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > maxW) {
      h = Math.round((h * maxW) / w);
      w = maxW;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    let quality = 0.88;
    let blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", quality),
    );

    while (blob && blob.size > maxBytes && quality > 0.35) {
      quality -= 0.08;
      blob = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", quality));
    }

    return blob ?? file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
