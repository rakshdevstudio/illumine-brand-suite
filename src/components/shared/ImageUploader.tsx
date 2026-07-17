import { useState, useCallback } from "react";
import { Upload, Loader2, Image as ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { ImageCategory, uploadImage, UploadProgress } from "@/lib/image-pipeline";
import { logger } from "@/lib/logger";
import { Progress } from "@/components/ui/progress";

export interface ImageUploaderProps {
  /** The category determines the root folder in R2 (e.g. products, schools) */
  category: ImageCategory;
  /** Sub-folder for organizing images (e.g. schoolSlug/productId) */
  folder: string;
  /** Maximum number of files allowed (default 1) */
  maxFiles?: number;
  /** Callback when an image is successfully uploaded */
  onUploadComplete: (url: string, storagePath: string, file: File) => void;
  /** Callback when upload fails */
  onUploadError?: (error: Error) => void;
  /** Optional max width for optimization */
  maxWidth?: number;
  /** Custom label */
  label?: string;
  /** Allow multiple files to be dropped */
  multiple?: boolean;
}

export const ImageUploader = ({
  category,
  folder,
  maxFiles = 1,
  onUploadComplete,
  onUploadError,
  maxWidth,
  label = "Drop image here or click to upload",
  multiple = false,
}: ImageUploaderProps) => {
  const [dragOver, setDragOver] = useState(false);
  const [progressState, setProgressState] = useState<UploadProgress | null>(null);

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    if (fileArray.length > maxFiles) {
      toast.error(`Maximum ${maxFiles} file(s) allowed`);
      return;
    }

    if (fileArray.length === 0) return;

    for (const file of fileArray) {
      try {
        const result = await uploadImage(file, {
          category,
          folder,
          maxWidth,
          onProgress: (progress) => setProgressState(progress),
        });
        
        onUploadComplete(result.publicUrl, result.storagePath, file);
        toast.success(`${file.name} uploaded successfully`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Upload failed");
        logger.error(`Upload failed for ${file.name}`, err);
        toast.error(err.message);
        onUploadError?.(err);
      }
    }
    
    setTimeout(() => setProgressState(null), 1000);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [category, folder, maxWidth]);

  const isUploading = progressState && progressState.stage !== "done" && progressState.stage !== "error";

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!isUploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={isUploading ? (e) => e.preventDefault() : handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all ${
          isUploading
            ? "border-muted-foreground/30 bg-muted/30 cursor-not-allowed"
            : dragOver
            ? "border-primary bg-primary/5 cursor-pointer"
            : "border-border hover:border-foreground/50 hover:bg-muted/20 cursor-pointer"
        }`}
        onClick={() => {
          if (isUploading) return;
          const input = document.createElement("input");
          input.type = "file";
          input.multiple = multiple || maxFiles > 1;
          input.accept = "image/jpeg,image/png,image/webp,image/bmp,image/tiff,image/gif";
          input.onchange = (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files) handleFiles(files);
          };
          input.click();
        }}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <div className="space-y-1 text-center w-full max-w-[200px]">
              <p className="text-sm font-medium text-foreground capitalize">
                {progressState.stage}...
              </p>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {progressState.message}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 pointer-events-none">
            <div className="p-3 bg-muted rounded-full">
              <Upload className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, WebP up to 20MB
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
