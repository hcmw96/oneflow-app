import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  onError?: (error: string) => void;
  /** Defaults to rear camera; use `user` for kiosk / front-facing tablet check-in. */
  defaultFacing?: "environment" | "user";
  showFlipButton?: boolean;
  size?: "default" | "large";
  className?: string;
}

function qrScanBoxSize(viewfinderWidth: number, viewfinderHeight: number, ratio: number) {
  const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * ratio);
  return { width: Math.max(edge, 200), height: Math.max(edge, 200) };
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
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">(defaultFacing);
  const isKiosk = size === "large";
  const scanBoxRatio = isKiosk ? 0.78 : 0.72;

  useEffect(() => {
    setCameraFacing(defaultFacing);
  }, [defaultFacing]);

  useEffect(() => {
    setPermissionDenied(false);
    const scanner = new Html5Qrcode(containerId, {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      verbose: false,
    });
    scannerRef.current = scanner;

    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-qr-scanner", containerId);
    styleEl.textContent = `
      #${containerId} {
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
      #${containerId} > div,
      #${containerId} > div > div {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        padding: 0 !important;
        border: none !important;
      }
      #${containerId} video {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        display: block !important;
      }
      #${containerId} canvas {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
      }
      #${containerId} img {
        display: none !important;
      }
      #${containerId} #qr-shaded-region {
        position: absolute !important;
        border-width: 3px !important;
        border-color: rgba(163, 182, 147, 0.95) !important;
        border-radius: 12px !important;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55) !important;
      }
    `;
    document.head.appendChild(styleEl);

    scanner
      .start(
        {
          facingMode: cameraFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        {
          fps: isKiosk ? 12 : 10,
          qrbox: (w, h) => qrScanBoxSize(w, h, scanBoxRatio),
          disableFlip: cameraFacing === "user",
        },
        (decodedText: string) => {
          onScanRef.current(decodedText);
        },
        () => {
          // per-frame miss — ignore
        },
      )
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Permission")) {
          setPermissionDenied(true);
        }
        onErrorRef.current?.(msg || "Camera error");
      });

    return () => {
      styleEl.remove();
      if (scannerRef.current?.isScanning) {
        void scannerRef.current.stop().catch(() => {});
      }
      scannerRef.current = null;
    };
  }, [cameraFacing, containerId, isKiosk, scanBoxRatio]);

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

  return (
    <div
      className={cn(
        "relative mx-auto overflow-hidden rounded-2xl border-[3px] border-[#a3b693] bg-black shadow-md",
        isKiosk
          ? "aspect-square h-full w-full max-h-[min(72vh,520px)] max-w-lg"
          : "aspect-square w-[min(90vw,320px)] max-w-[320px]",
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
