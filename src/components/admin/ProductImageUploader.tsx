import { supabase } from "@/integrations/supabase/client";
import { X, Star } from "lucide-react";
import { toast } from "sonner";
import { ImageUploader } from "@/components/shared/ImageUploader";
import { deleteImage } from "@/lib/image-pipeline";

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
  const handleUploadComplete = async (publicUrl: string, storagePath: string) => {
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

    if (insertError) {
      toast.error("Failed to save image record");
      throw insertError;
    }
    
    onImagesChange();
  };

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
    try {
      await deleteImage(image.storage_path);
      await supabase.from("product_images").delete().eq("id", image.id);
      onImagesChange();
      toast.success("Image removed");
    } catch (err) {
      toast.error("Failed to delete image");
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block">
        Product Images
      </label>

      {/* Existing images */}
      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
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

      {/* Uploader component */}
      <ImageUploader
        category="products"
        folder={`${schoolSlug}/${productId}`}
        maxFiles={10}
        multiple={true}
        onUploadComplete={handleUploadComplete}
        label="Drop product images here"
      />
    </div>
  );
};

export default ProductImageUploader;
