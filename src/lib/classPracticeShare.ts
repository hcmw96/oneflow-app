const SHARE_URL = "https://oneflow1.netlify.app";
const LOGO_PATH = "/email/oneflow-logo.png";
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

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

export async function generateClassPracticeShareImage(
  input: ClassPracticeShareInput,
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const sage = "#a3b693";
  const dark = "#2f3d2a";
  const muted = "#f5f7f2";

  ctx.fillStyle = sage;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = muted;
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  ctx.arc(CANVAS_WIDTH * 0.85, CANVAS_HEIGHT * 0.12, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(CANVAS_WIDTH * 0.1, CANVAS_HEIGHT * 0.88, 280, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  try {
    const logo = await loadImage(LOGO_PATH);
    const logoW = 360;
    const logoH = (logo.height / logo.width) * logoW;
    ctx.drawImage(logo, (CANVAS_WIDTH - logoW) / 2, 220, logoW, logoH);
  } catch {
    ctx.fillStyle = muted;
    ctx.font = "700 72px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("One Flow", CANVAS_WIDTH / 2, 320);
  }

  ctx.fillStyle = muted;
  ctx.font = "600 44px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Practice complete", CANVAS_WIDTH / 2, 680);

  ctx.fillStyle = dark;
  ctx.font = "700 64px Georgia, 'Times New Roman', serif";
  wrapCanvasText(ctx, input.className, CANVAS_WIDTH / 2, 860, CANVAS_WIDTH - 160, 74);

  ctx.fillStyle = dark;
  ctx.globalAlpha = 0.85;
  ctx.font = "500 40px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(formatShareDate(input.startsAt, input.timeZone), CANVAS_WIDTH / 2, 1180);
  ctx.globalAlpha = 1;

  ctx.fillStyle = muted;
  ctx.font = "600 36px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("oneflow1.netlify.app", CANVAS_WIDTH / 2, CANVAS_HEIGHT - 180);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 0.92);
  });
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
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

  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((ln, i) => {
    ctx.fillText(ln, x, startY + i * lineHeight);
  });
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareClassPractice(input: ClassPracticeShareInput): Promise<{
  method: "share" | "copy" | "none";
}> {
  const { title, text, url } = classPracticeShareText(input);
  const imageBlob = await generateClassPracticeShareImage(input);

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    const file =
      imageBlob != null
        ? new File([imageBlob], "oneflow-practice.png", { type: "image/png" })
        : null;

    const withFiles = file
      ? { title, text: `${text}\n${url}`, files: [file] }
      : { title, text: `${text}\n${url}`, url };

    try {
      if (file && navigator.canShare && !navigator.canShare(withFiles)) {
        await navigator.share({ title, text: `${text}\n${url}`, url });
        return { method: "share" };
      }
      await navigator.share(withFiles);
      return { method: "share" };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { method: "none" };
      }
    }
  }

  const copied = await copyTextToClipboard(`${text}\n${url}`);
  return { method: copied ? "copy" : "none" };
}
