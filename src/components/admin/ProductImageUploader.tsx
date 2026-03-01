import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, X, Star, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ProductImage {
  id: string;
  image_url: string;
  storage_path: string;
  is_primary: boolean;
  sort_order: number;
}

interface ProductImageUploaderProps {
  productId: string;
  schoolSlug: string;
  images: ProductImage[];
  onImagesChange: () => void;
}

const ProductImageUploader = ({ productId, schoolSlug, images, onImagesChange }: ProductImageUploaderProps) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const uploadFile = async (file: File) => {
    const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${Date.now()}.${fileExt}`;
    const storagePath = `${schoolSlug}/${productId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(storagePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from("product-images")
      .getPublicUrl(storagePath);

    const isPrimary = images.length === 0;

    const { error: insertError } = await supabase
      .from("product_images")
      .insert({
        product_id: productId,
        image_url: publicUrl,
        storage_path: storagePath,
        is_primary: isPrimary,
        sort_order: images.length,
      });

    if (insertError) throw insertError;
  };

  const handleFiles = async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter((f) =>
      f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024
    );
    if (validFiles.length === 0) {
      toast.error("Please upload valid image files (max 10MB)");
      return;
    }

    setUploading(true);
    try {
      for (const file of validFiles) {
        await uploadFile(file);
      }
      toast.success(`${validFiles.length} image(s) uploaded`);
      onImagesChange();
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [images]);

  const handleSetPrimary = async (imageId: string) => {
    await supabase
      .from("product_images")
      .update({ is_primary: false })
      .eq("product_id", productId);
    await supabase
      .from("product_images")
      .update({ is_primary: true })
      .eq("id", imageId);
    onImagesChange();
    toast.success("Primary image updated");
  };

  const handleDelete = async (image: ProductImage) => {
    await supabase.storage.from("product-images").remove([image.storage_path]);
    await supabase.from("product_images").delete().eq("id", image.id);
    onImagesChange();
    toast.success("Image removed");
  };

  return (
    <div className="space-y-3">
      <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block">
        Product Images
      </label>

      {/* Existing images */}
      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {images
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((img) => (
              <div key={img.id} className="relative group w-20 h-20 border border-border overflow-hidden bg-secondary">
                <img
                  src={img.image_url}
                  alt=""
                  className="w-full h-full object-contain"
                />
                <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(img.id)}
                    className={`p-1 rounded-sm ${img.is_primary ? "text-yellow-400" : "text-background hover:text-yellow-400"}`}
                    title="Set as primary"
                  >
                    <Star className="h-3.5 w-3.5" fill={img.is_primary ? "currentColor" : "none"} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(img)}
                    className="p-1 text-background hover:text-destructive"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {img.is_primary && (
                  <div className="absolute top-0 left-0 bg-foreground text-background text-[8px] px-1 tracking-wider uppercase">
                    Primary
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-sm p-6 text-center transition-colors cursor-pointer ${
          dragOver ? "border-foreground bg-accent" : "border-border"
        }`}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.multiple = true;
          input.accept = "image/*";
          input.onchange = (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files) handleFiles(files);
          };
          input.click();
        }}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Uploading...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-xs text-muted-foreground">
              Drop images here or click to upload
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductImageUploader;
