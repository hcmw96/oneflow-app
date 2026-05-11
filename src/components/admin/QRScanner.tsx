import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { RefreshCw } from "lucide-react";

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  onError?: (error: string) => void;
}

export function QRScanner({ onScan, onError }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const containerId = "qr-scanner-container";

  useEffect(() => {
    setPermissionDenied(false);
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: cameraFacing },
        {
          fps: 10,
          // ~75% of smallest frame (280px) so the scan region fits inside the sage border on mobile
          qrbox: { width: 210, height: 210 },
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
  }, [cameraFacing]);

  if (permissionDenied) {
    return (
      <div className="mx-auto flex aspect-square w-[min(90vw,320px)] max-w-[320px] items-center justify-center rounded-2xl border-[3px] border-dashed border-[#a3b693] bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        Camera access denied. Please allow camera access in your browser settings.
      </div>
    );
  }

  return (
    <div className="relative mx-auto aspect-square w-[min(90vw,320px)] max-w-[320px] overflow-hidden rounded-2xl border-[3px] border-[#a3b693] bg-black shadow-md">
      <div id={containerId} className="h-full w-full min-h-0" />
      {/* Viewfinder corners — scan area guide */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center p-[9%]"
        aria-hidden
      >
        <div className="relative aspect-square w-[min(72%,210px)] max-w-full">
          <span className="absolute left-0 top-0 h-9 w-9 rounded-tl-md border-l-[3px] border-t-[3px] border-[#a3b693]" />
          <span className="absolute right-0 top-0 h-9 w-9 rounded-tr-md border-r-[3px] border-t-[3px] border-[#a3b693]" />
          <span className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-md border-b-[3px] border-l-[3px] border-[#a3b693]" />
          <span className="absolute bottom-0 right-0 h-9 w-9 rounded-br-md border-b-[3px] border-r-[3px] border-[#a3b693]" />
        </div>
      </div>
      <button
        type="button"
        onClick={() => setCameraFacing((prev) => (prev === "environment" ? "user" : "environment"))}
        className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {cameraFacing === "environment" ? "Use front" : "Use back"}
      </button>
    </div>
  );
}
