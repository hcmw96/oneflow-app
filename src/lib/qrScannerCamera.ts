import { Html5Qrcode } from "html5-qrcode";

export type CameraFacing = "environment" | "user";

const MIN_QR_BOX = 50;

/** Keep qrbox inside the viewfinder (html5-qrcode throws if it is larger). */
export function computeQrBoxSize(viewfinderWidth: number, viewfinderHeight: number, ratio: number) {
  const maxEdge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * ratio);
  const edge = Math.min(maxEdge, viewfinderWidth - 8, viewfinderHeight - 8);
  const size = Math.max(Math.min(edge, 320), MIN_QR_BOX);
  return { width: size, height: size };
}

export function waitForElementLayout(elementId: string, maxFrames = 60): Promise<void> {
  return new Promise((resolve) => {
    let frames = 0;
    const tick = () => {
      const el = document.getElementById(elementId);
      if (el && el.clientWidth > 0 && el.clientHeight > 0) {
        resolve();
        return;
      }
      frames += 1;
      if (frames >= maxFrames) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function labelMatches(label: string, facing: CameraFacing) {
  const lower = label.toLowerCase();
  if (facing === "environment") {
    return /back|rear|environment|traseira|arrière/.test(lower);
  }
  return /front|user|facetime|selfie|avant|frontal/.test(lower);
}

/** Prefer a concrete device id — facingMode alone is unreliable on iOS Safari. */
export async function resolveCameraStartArg(
  facing: CameraFacing,
): Promise<string | { facingMode: { ideal: CameraFacing } }> {
  try {
    const cameras = await Html5Qrcode.getCameras();
    if (cameras.length === 0) {
      return { facingMode: { ideal: facing } };
    }

    const byLabel = cameras.find((c) => labelMatches(c.label, facing));
    if (byLabel) return byLabel.id;

    if (facing === "environment" && cameras.length > 1) {
      return cameras[cameras.length - 1]!.id;
    }

    return cameras[0]!.id;
  } catch {
    return { facingMode: { ideal: facing } };
  }
}

export function isCameraPermissionError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("permission") ||
    lower.includes("notallowed") ||
    lower.includes("denied") ||
    lower.includes("security")
  );
}
