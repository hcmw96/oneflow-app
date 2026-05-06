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
          qrbox: { width: 220, height: 220 },
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
      <div className="flex aspect-square max-w-xs items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        Camera access denied. Please allow camera access in your browser settings.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-black">
      <div id={containerId} className="aspect-square w-full max-w-xs" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-48 w-48">
          <span className="absolute left-0 top-0 h-8 w-8 rounded-tl border-l-4 border-t-4 border-primary" />
          <span className="absolute right-0 top-0 h-8 w-8 rounded-tr border-r-4 border-t-4 border-primary" />
          <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl border-b-4 border-l-4 border-primary" />
          <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br border-b-4 border-r-4 border-primary" />
        </div>
      </div>
      <button
        type="button"
        onClick={() => setCameraFacing((prev) => (prev === "environment" ? "user" : "environment"))}
        className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {cameraFacing === "environment" ? "Use front" : "Use back"}
      </button>
    </div>
  );
}
