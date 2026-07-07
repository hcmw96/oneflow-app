export const SHARE_URL = "https://oneflow1.netlify.app";
/** Public logo — `public/icons/` has PWA icons only; brand mark is under `public/email/`. */
export const PRACTICE_SHARE_LOGO_PATH = "/email/oneflow-logo.png";
export const PRACTICE_SHARE_WIDTH = 1080;
export const PRACTICE_SHARE_HEIGHT = 1920;
const SAGE = "#a3b693";

export type ClassPracticeShareInput = {
  className: string;
  guideName: string;
  startsAt: Date;
  timeZone: string;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${src}`));
    img.src = src;
  });
}

export function loadImageFromFile(file: File): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ image: img, objectUrl });
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load photo"));
    };
    img.src = objectUrl;
  });
}

function formatShareDate(startsAt: Date, timeZone: string): string {
  return startsAt.toLocaleDateString("en-ZA", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function classPracticeShareText(input: ClassPracticeShareInput): {
  title: string;
  text: string;
  url: string;
} {
  const guide = input.guideName.trim() || "my guide";
  return {
    title: "I just completed a class at One Flow 🌿",
    text: `Just finished ${input.className} with ${guide} at One Flow. Feeling amazing. 💚`,
    url: SHARE_URL,
  };
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
): void {
  const canvasAspect = width / height;
  const imgAspect = img.width / img.height;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;

  if (imgAspect > canvasAspect) {
    sw = img.height * canvasAspect;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / canvasAspect;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
}

function drawSageGradientBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#b8c9a8");
  gradient.addColorStop(0.5, SAGE);
  gradient.addColorStop(1, "#8fa67d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function wrapCanvasTextLeft(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  lines.forEach((ln, i) => {
    ctx.fillText(ln, x, y + i * lineHeight);
  });
  return lines.length;
}

async function drawWhiteLogo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
): Promise<number> {
  try {
    const logo = await loadImage(PRACTICE_SHARE_LOGO_PATH);
    const logoH = (logo.height / logo.width) * width;
    ctx.save();
    ctx.filter = "brightness(0) invert(1)";
    ctx.drawImage(logo, x, y, width, logoH);
    ctx.restore();
    return logoH;
  } catch {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 48px Georgia, serif";
    ctx.textAlign = "left";
    ctx.fillText("One Flow", x, y + 48);
    ctx.restore();
    return 56;
  }
}

export async function renderPracticeShareCanvas(
  canvas: HTMLCanvasElement,
  input: ClassPracticeShareInput,
  backgroundImage: HTMLImageElement | null,
): Promise<void> {
  const width = PRACTICE_SHARE_WIDTH;
  const height = PRACTICE_SHARE_HEIGHT;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (backgroundImage) {
    drawCoverImage(ctx, backgroundImage, width, height);
  } else {
    drawSageGradientBackground(ctx, width, height);
  }

  const overlayHeight = height * 0.4;
  const overlayTop = height - overlayHeight;
  const overlayGrad = ctx.createLinearGradient(0, overlayTop, 0, height);
  overlayGrad.addColorStop(0, "rgba(0,0,0,0)");
  overlayGrad.addColorStop(0.35, "rgba(0,0,0,0.45)");
  overlayGrad.addColorStop(1, "rgba(0,0,0,0.82)");
  ctx.fillStyle = overlayGrad;
  ctx.fillRect(0, overlayTop, width, overlayHeight);

  const accentBarHeight = 18;
  ctx.fillStyle = SAGE;
  ctx.fillRect(0, height - accentBarHeight, width, accentBarHeight);

  const paddingX = 72;
  await drawWhiteLogo(ctx, paddingX, 72, 220);

  const dateText = formatShareDate(input.startsAt, input.timeZone);
  const guide = input.guideName.trim();
  const textMaxWidth = width - paddingX * 2;
  const accentTop = height - accentBarHeight;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "500 34px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(dateText, paddingX, accentTop - 56);

  let textCursorY = accentTop - 120;

  if (guide) {
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = "500 42px system-ui, -apple-system, Segoe UI, sans-serif";
    const guideLines = wrapCanvasTextLeft(ctx, `with ${guide}`, paddingX, textCursorY, textMaxWidth, 50);
    textCursorY -= guideLines * 50 + 28;
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 68px Georgia, 'Times New Roman', serif";
  wrapCanvasTextLeft(ctx, input.className, paddingX, textCursorY, textMaxWidth, 78);
}

export function practiceShareCanvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 0.92);
  });
}

export function downloadPracticeShareBlob(blob: Blob, filename = "oneflow-practice.png"): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function canSharePracticeFiles(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export async function sharePracticeShareBlob(
  blob: Blob,
  input: ClassPracticeShareInput,
): Promise<"share" | "cancelled" | "failed"> {
  const { title, text, url } = classPracticeShareText(input);
  if (typeof navigator.share !== "function") return "failed";

  const file = new File([blob], "oneflow-practice.png", { type: "image/png" });
  const shareText = `${text}\n${url}`;
  const filePayload = { title, text: shareText, files: [file] };
  const linkPayload = { title, text: shareText, url };

  try {
    if (navigator.canShare?.(filePayload)) {
      await navigator.share(filePayload);
      return "share";
    }
    if (navigator.canShare?.(linkPayload)) {
      await navigator.share(linkPayload);
      return "share";
    }
    await navigator.share(linkPayload);
    return "share";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return "cancelled";
    }
    return "failed";
  }
}
