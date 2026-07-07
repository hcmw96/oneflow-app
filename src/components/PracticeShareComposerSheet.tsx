import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Download, ImagePlus, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  canSharePracticeFiles,
  downloadPracticeShareBlob,
  loadImageFromFile,
  practiceShareCanvasToBlob,
  renderPracticeShareCanvas,
  sharePracticeShareBlob,
  type ClassPracticeShareInput,
} from "@/lib/classPracticeShare";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: ClassPracticeShareInput | null;
  /** Called after a successful share or download export. */
  onShared?: () => void;
};

export function PracticeShareComposerSheet({ open, onOpenChange, input, onShared }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const photoObjectUrlRef = useRef<string | null>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);

  const [composing, setComposing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(false);

  const revokePhotoUrl = useCallback(() => {
    if (photoObjectUrlRef.current) {
      URL.revokeObjectURL(photoObjectUrlRef.current);
      photoObjectUrlRef.current = null;
    }
    backgroundImageRef.current = null;
    setHasPhoto(false);
  }, []);

  const composePreview = useCallback(async () => {
    if (!input || !canvasRef.current) return;
    setComposing(true);
    setPreviewReady(false);
    try {
      await renderPracticeShareCanvas(
        canvasRef.current,
        input,
        backgroundImageRef.current,
      );
      setPreviewReady(true);
    } catch (e) {
      console.error("[PracticeShareComposer] compose failed", e);
      toast.error("Could not build preview");
    } finally {
      setComposing(false);
    }
  }, [input]);

  useEffect(() => {
    if (!open) {
      revokePhotoUrl();
      setPreviewReady(false);
      return;
    }
    void composePreview();
  }, [open, input, composePreview, revokePhotoUrl]);

  const onPhotoSelected = async (file: File | undefined) => {
    if (!file) return;
    revokePhotoUrl();
    try {
      const { image, objectUrl } = await loadImageFromFile(file);
      photoObjectUrlRef.current = objectUrl;
      backgroundImageRef.current = image;
      setHasPhoto(true);
      await composePreview();
    } catch {
      toast.error("Could not load that photo");
    }
  };

  const clearPhoto = async () => {
    revokePhotoUrl();
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    await composePreview();
  };

  const onShare = async () => {
    if (!input || !canvasRef.current) return;
    setSharing(true);
    try {
      const blob = await practiceShareCanvasToBlob(canvasRef.current);
      if (!blob) {
        toast.error("Could not export image");
        return;
      }

      if (canSharePracticeFiles()) {
        const result = await sharePracticeShareBlob(blob, input);
        if (result === "share") {
          toast.success("Shared!");
          onShared?.();
          onOpenChange(false);
          return;
        }
        if (result === "cancelled") {
          return;
        }
        downloadPracticeShareBlob(blob);
        toast.success("Share unavailable — image downloaded instead");
        onShared?.();
        onOpenChange(false);
        return;
      }

      downloadPracticeShareBlob(blob);
      toast.success("Image downloaded");
      onShared?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not share");
    } finally {
      setSharing(false);
    }
  };

  const nativeShare = canSharePracticeFiles();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl px-4 pb-8 pt-6">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display">Share your practice</SheetTitle>
          <SheetDescription>
            Add a photo for your story, preview the design, then share.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="h-4 w-4" aria-hidden />
            Take photo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => uploadInputRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" aria-hidden />
            Upload photo
          </Button>
          {hasPhoto ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void clearPhoto()}>
              Remove photo
            </Button>
          ) : null}
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void onPhotoSelected(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void onPhotoSelected(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <div className="relative mx-auto mt-5 w-full max-w-[280px]">
          <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-[#a3b693] shadow-lg ring-1 ring-black/10">
            <canvas
              ref={canvasRef}
              className="h-full w-full object-cover"
              aria-label="Share preview"
            />
            {composing || !previewReady ? (
              <div className="absolute inset-0 grid place-content-center bg-black/20">
                <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden />
              </div>
            ) : null}
          </div>
        </div>

        <Button
          type="button"
          className="mt-6 w-full gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
          disabled={sharing || composing || !previewReady || !input}
          onClick={() => void onShare()}
        >
          {sharing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : nativeShare ? (
            <Share2 className="h-4 w-4" aria-hidden />
          ) : (
            <Download className="h-4 w-4" aria-hidden />
          )}
          {sharing ? "Preparing…" : nativeShare ? "Share" : "Download image"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
