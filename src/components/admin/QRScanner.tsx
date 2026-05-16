import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
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

export function QRScanner({
  onScan,
  onError,
  defaultFacing = "environment",
  showFlipButton = true,
  size = "default",
  className,
}: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">(defaultFacing);
  const containerId = "qr-scanner-container";
  const qrboxSize = size === "large" ? 280 : 210;

  useEffect(() => {
    setCameraFacing(defaultFacing);
  }, [defaultFacing]);

  useEffect(() => {
    setPermissionDenied(false);
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: cameraFacing },
        {
          fps: 10,
          qrbox: { width: qrboxSize, height: qrboxSize },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          onScanRef.current(decodedText);
        },
        () => {
          // scan errors are noisy — ignore
        },
      )
      .then(() => {})
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Permission")) {
          setPermissionDenied(true);
        }
        onErrorRef.current?.(msg || "Camera error");
      });

    return () => {
      if (scannerRef.current?.isScanning) {
        void scannerRef.current.stop().catch(() => {});
      }
      scannerRef.current = null;
    };
  }, [cameraFacing, qrboxSize]);

  if (permissionDenied) {
    return (
      <div
        className={cn(
          "mx-auto flex aspect-square items-center justify-center rounded-2xl border-[3px] border-dashed border-[#a3b693] bg-muted/30 p-4 text-center text-sm text-muted-foreground",
          size === "large"
            ? "h-full min-h-[280px] w-full max-w-none"
            : "w-[min(90vw,320px)] max-w-[320px]",
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
        "relative mx-auto aspect-square overflow-hidden rounded-2xl border-[3px] border-[#a3b693] bg-black shadow-md",
        size === "large"
          ? "h-full min-h-[280px] w-full max-w-none"
          : "w-[min(90vw,320px)] max-w-[320px]",
        className,
      )}
    >
      <div id={containerId} className="h-full w-full min-h-0" />
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center p-[9%]"
        aria-hidden
      >
        <div
          className={cn(
            "relative aspect-square max-w-full",
            size === "large" ? "w-[min(72%,280px)]" : "w-[min(72%,210px)]",
          )}
        >
          <span className="absolute left-0 top-0 h-9 w-9 rounded-tl-md border-l-[3px] border-t-[3px] border-[#a3b693]" />
          <span className="absolute right-0 top-0 h-9 w-9 rounded-tr-md border-r-[3px] border-t-[3px] border-[#a3b693]" />
          <span className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-md border-b-[3px] border-l-[3px] border-[#a3b693]" />
          <span className="absolute bottom-0 right-0 h-9 w-9 rounded-br-md border-b-[3px] border-r-[3px] border-[#a3b693]" />
        </div>
      </div>
      {showFlipButton ? (
        <button
          type="button"
          onClick={() => setCameraFacing((prev) => (prev === "environment" ? "user" : "environment"))}
          className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {cameraFacing === "environment" ? "Use front" : "Use back"}
        </button>
      ) : null}
    </div>
  );
}
