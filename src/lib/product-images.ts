/**
 * Maps product categories to curated, high-quality Unsplash image URLs.
 * All images are studio-style, white/clean background, premium feel.
 */

const categoryImages: Record<string, string[]> = {
  shirt: [
    "https://images.unsplash.com/photo-1598032895397-b9472444bf93?w=600&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&h=800&fit=crop&q=80",
  ],
  pant: [
    "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=600&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=600&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=600&h=800&fit=crop&q=80",
  ],
  blazer: [
    "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1592878904946-b3cd8ae243d0?w=600&h=800&fit=crop&q=80",
  ],
  tie: [
    "https://images.unsplash.com/photo-1589756823695-278bc923a351?w=600&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=600&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1590548784585-643d2b9f2925?w=600&h=800&fit=crop&q=80",
  ],
  skirt: [
    "https://images.unsplash.com/photo-1583496661160-fb5886a0uj9a?w=600&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=600&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1592301933927-35b597393c0a?w=600&h=800&fit=crop&q=80",
  ],
  sweater: [
    "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=600&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=600&h=800&fit=crop&q=80",
    "https://images.unsplash.com/photo-1614975059251-992f11792571?w=600&h=800&fit=crop&q=80",
  ],
};

const fallbackImage = "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=600&h=800&fit=crop&q=80";

/**
 * Get a product image URL based on category.
 * Uses a hash of the product name for consistent but varied selection.
 */
export function getProductImageUrl(category: string, productName?: string): string {
  const key = category.toLowerCase().trim();
  const images = categoryImages[key];
  
  if (!images || images.length === 0) return fallbackImage;
  
  // Use product name to pick a consistent image variant
  const hash = (productName ?? "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return images[hash % images.length];
}

/**
 * Get the display image for a product, preferring stored image_url.
 */
export function getDisplayImage(product: { image_url?: string | null; category: string; name: string }): string {
  if (product.image_url) return product.image_url;
  return getProductImageUrl(product.category, product.name);
}
