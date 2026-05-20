import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeQrBoxSize,
  isCameraPermissionError,
  MIN_SCANNER_VIEWPORT,
  resolveCameraStartArg,
  waitForElementLayout,
  waitForVideoFrames,
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>(defaultFacing);
  const [viewportReady, setViewportReady] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const isKiosk = size === "large";
  const scanBoxRatio = isKiosk ? 0.78 : 0.72;

  useEffect(() => {
    setCameraFacing(defaultFacing);
  }, [defaultFacing]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setViewportReady(width >= MIN_SCANNER_VIEWPORT && height >= MIN_SCANNER_VIEWPORT);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!viewportReady) return;

    let cancelled = false;
    setStreamReady(false);

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
        background: transparent !important;
        overflow: hidden !important;
      }
      #${containerId} video {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        min-width: 100% !important;
        min-height: 100% !important;
        object-fit: cover !important;
        object-position: center !important;
        display: block !important;
        z-index: 1 !important;
        background: #000 !important;
      }
      #${containerId} img {
        display: none !important;
      }
      #${containerId} canvas {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        opacity: 0 !important;
        pointer-events: none !important;
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

      const hasLayout = await waitForElementLayout(containerId);
      if (cancelled || !hasLayout) return;

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

      const attachVideo = (video: HTMLVideoElement) => {
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.muted = true;
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "cover";
        if (cameraFacing === "user") {
          video.style.transform = "scaleX(-1)";
        }
        void video.play().catch(() => {});
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

        const video = await waitForVideoFrames(containerId);
        if (cancelled) return;
        if (video) attachVideo(video);
        setStreamReady(true);
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
  }, [cameraFacing, containerId, isKiosk, scanBoxRatio, retryKey, viewportReady]);

  const frameClass = cn(
    "relative mx-auto overflow-hidden rounded-2xl border-[3px] border-[#a3b693] bg-black shadow-md",
    isKiosk
      ? "aspect-square w-full max-w-[min(100%,28rem)] shrink-0"
      : "aspect-square w-[min(90vw,320px)] max-w-[320px] shrink-0",
    className,
  );

  if (permissionDenied) {
    return (
      <div
        className={cn(
          frameClass,
          "flex items-center justify-center p-4 text-center text-sm text-muted-foreground",
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
          frameClass,
          "flex flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted-foreground",
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
    <div ref={wrapperRef} className={frameClass}>
      {viewportReady ? <div id={containerId} className="absolute inset-0 h-full w-full" /> : null}
      {!streamReady ? (
        <div
          className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 bg-black/90 text-white"
          aria-live="polite"
        >
          <Loader2 className="h-8 w-8 animate-spin text-[#a3b693]" aria-hidden />
          <span className="text-xs font-medium text-white/80">Starting camera…</span>
        </div>
      ) : null}
      {showFlipButton && streamReady ? (
        <button
          type="button"
          onClick={() => {
            setStreamReady(false);
            setCameraFacing((prev) => (prev === "environment" ? "user" : "environment"));
          }}
          className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {cameraFacing === "environment" ? "Use front camera" : "Use back camera"}
        </button>
      ) : null}
    </div>
  );
}
