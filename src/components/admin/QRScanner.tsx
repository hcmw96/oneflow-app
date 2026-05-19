import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeQrBoxSize,
  isCameraPermissionError,
  resolveCameraStartArg,
  waitForElementLayout,
  type CameraFacing,
} from "@/lib/qrScannerCamera";

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  onError?: (error: string) => void;
  /** Defaults to rear camera; use `user` for kiosk / front-facing tablet check-in. */
  defaultFacing?: CameraFacing;
  showFlipButton?: boolean;
  size?: "default" | "large";
  className?: string;
}

export function QRScanner({
  onScan,
  onError,
  defaultFacing = "environment",
  showFlipButton = true,
  size = "default",
  className,
}: QRScannerProps) {
  const reactId = useId().replace(/:/g, "");
  const containerId = `qr-scanner-${reactId}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>(defaultFacing);
  const isKiosk = size === "large";
  const scanBoxRatio = isKiosk ? 0.78 : 0.72;

  useEffect(() => {
    setCameraFacing(defaultFacing);
  }, [defaultFacing]);

  useEffect(() => {
    let cancelled = false;

    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-qr-scanner", containerId);
    styleEl.textContent = `
      #${containerId},
      #${containerId} > div {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        min-height: 0 !important;
        padding: 0 !important;
        border: none !important;
        background: #000 !important;
        overflow: hidden !important;
      }
      #${containerId} video {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        object-position: center !important;
        display: block !important;
        z-index: 1 !important;
      }
      #${containerId} img {
        display: none !important;
      }
      #${containerId} canvas {
        display: none !important;
      }
      #${containerId} #qr-shaded-region {
        z-index: 2 !important;
        border-width: 3px !important;
        border-color: rgba(163, 182, 147, 0.95) !important;
        border-radius: 12px !important;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55) !important;
      }
    `;
    document.head.appendChild(styleEl);

    const run = async () => {
      setPermissionDenied(false);
      setCameraError(null);

      await waitForElementLayout(containerId);
      if (cancelled) return;

      const scanner = new Html5Qrcode(containerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;

      const cameraArg = await resolveCameraStartArg(cameraFacing);
      if (cancelled) return;

      const scanConfig = {
        fps: isKiosk ? 12 : 10,
        qrbox: (w: number, h: number) => computeQrBoxSize(w, h, scanBoxRatio),
        disableFlip: cameraFacing === "user",
      };

      const startWith = async (arg: string | { facingMode: { ideal: CameraFacing } }) => {
        const config =
          typeof arg === "string"
            ? scanConfig
            : {
                ...scanConfig,
                videoConstraints: { facingMode: { ideal: arg.facingMode.ideal } },
              };

        await scanner.start(
          arg,
          config,
          (decodedText: string) => {
            onScanRef.current(decodedText);
          },
          () => {
            // per-frame miss — ignore
          },
        );

        const video = document.querySelector<HTMLVideoElement>(`#${containerId} video`);
        if (video) {
          video.setAttribute("playsinline", "true");
          video.setAttribute("webkit-playsinline", "true");
          video.muted = true;
          void video.play().catch(() => {});
        }
      };

      try {
        await startWith(cameraArg);
      } catch (firstErr: unknown) {
        if (cancelled) return;
        const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);

        const alternate: CameraFacing = cameraFacing === "environment" ? "user" : "environment";
        try {
          if (scanner.isScanning) await scanner.stop();
          const fallbackArg = await resolveCameraStartArg(alternate);
          if (cancelled) return;
          await startWith(fallbackArg);
          if (!cancelled) setCameraFacing(alternate);
          return;
        } catch {
          // try generic facingMode ideal below
        }

        try {
          if (scanner.isScanning) await scanner.stop();
          if (cancelled) return;
          await startWith({ facingMode: { ideal: cameraFacing } });
          return;
        } catch (secondErr: unknown) {
          const msg = secondErr instanceof Error ? secondErr.message : String(secondErr);
          if (isCameraPermissionError(firstMsg) || isCameraPermissionError(msg)) {
            setPermissionDenied(true);
          } else {
            setCameraError(msg || firstMsg || "Could not start camera");
          }
          onErrorRef.current?.(msg || firstMsg || "Camera error");
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      styleEl.remove();
      if (scannerRef.current?.isScanning) {
        void scannerRef.current.stop().catch(() => {});
      }
      scannerRef.current = null;
    };
  }, [cameraFacing, containerId, isKiosk, scanBoxRatio, retryKey]);

  if (permissionDenied) {
    return (
      <div
        className={cn(
          "mx-auto flex aspect-square items-center justify-center rounded-2xl border-[3px] border-dashed border-[#a3b693] bg-muted/30 p-4 text-center text-sm text-muted-foreground",
          isKiosk ? "h-full w-full max-w-lg" : "w-[min(90vw,320px)] max-w-[320px]",
          className,
        )}
      >
        Camera access denied. Please allow camera access in your browser settings.
      </div>
    );
  }

  if (cameraError) {
    return (
      <div
        className={cn(
          "mx-auto flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border-[3px] border-dashed border-[#a3b693] bg-muted/30 p-4 text-center text-sm text-muted-foreground",
          isKiosk ? "h-full w-full max-w-lg" : "w-[min(90vw,320px)] max-w-[320px]",
          className,
        )}
      >
        <p>{cameraError}</p>
        <button
          type="button"
          onClick={() => {
            setCameraError(null);
            setRetryKey((k) => k + 1);
          }}
          className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative mx-auto overflow-hidden rounded-2xl border-[3px] border-[#a3b693] bg-black shadow-md",
        isKiosk
          ? "aspect-square w-full max-w-[min(100%,28rem)] shrink-0"
          : "aspect-square w-[min(90vw,320px)] max-w-[320px] shrink-0",
        className,
      )}
    >
      <div id={containerId} className="absolute inset-0 h-full w-full" />
      {showFlipButton ? (
        <button
          type="button"
          onClick={() => setCameraFacing((prev) => (prev === "environment" ? "user" : "environment"))}
          className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {cameraFacing === "environment" ? "Use front camera" : "Use back camera"}
        </button>
      ) : null}
    </div>
  );
}
