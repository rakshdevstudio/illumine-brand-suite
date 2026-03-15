export const STORE_ADD_TO_CART_EVENT = "store:add-to-cart";

export type StoreAnimationRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type StoreAddToCartDetail = {
  sourceRect?: StoreAnimationRect;
  imageUrl?: string | null;
};

export const toAnimationRect = (element: HTMLElement | null): StoreAnimationRect | undefined => {
  if (!element) return undefined;

  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
};

export const emitStoreAddToCart = (detail: StoreAddToCartDetail = {}) => {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<StoreAddToCartDetail>(STORE_ADD_TO_CART_EVENT, { detail })
  );
};