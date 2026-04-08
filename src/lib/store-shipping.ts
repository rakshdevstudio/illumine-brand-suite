import type { StorefrontProduct } from "@/lib/storefront";

export type ShippingSummary = {
  label: string;
  detail: string;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

const getEtaLabel = (minDays: number | null, maxDays: number | null) => {
  if (typeof minDays === "number" && typeof maxDays === "number") {
    return `${minDays}-${maxDays} business days`;
  }

  if (typeof minDays === "number") {
    return `${minDays}+ business days`;
  }

  if (typeof maxDays === "number") {
    return `up to ${maxDays} business days`;
  }

  return null;
};

export const getShippingSummary = (
  product: Pick<
    StorefrontProduct,
    "shippingMode" | "shippingFee" | "freeShippingThreshold" | "etaMinBusinessDays" | "etaMaxBusinessDays" | "shippingNote"
  >,
  subtotal?: number,
): ShippingSummary => {
  const etaLabel = getEtaLabel(product.etaMinBusinessDays, product.etaMaxBusinessDays);
  const note = product.shippingNote?.trim() || null;
  const mode = product.shippingMode ?? "included";
  const shippingFee = Number(product.shippingFee ?? 0);
  const threshold = product.freeShippingThreshold;

  if (mode === "flat" && shippingFee > 0) {
    return {
      label: `Shipping ${formatCurrency(shippingFee)}`,
      detail: note ?? (etaLabel ? `Estimated delivery in ${etaLabel}.` : "Shipping is added separately to your order total."),
    };
  }

  if (mode === "conditional" && typeof threshold === "number" && threshold > 0) {
    const qualifies = typeof subtotal === "number" && subtotal >= threshold;
    return {
      label: qualifies ? "Complimentary shipping unlocked" : `Free shipping above ${formatCurrency(threshold)}`,
      detail: note ?? (etaLabel ? `Estimated delivery in ${etaLabel}.` : "Shipping is calculated from your final order value."),
    };
  }

  if (mode === "contact") {
    return {
      label: "Shipping confirmed after checkout",
      detail: note ?? (etaLabel ? `Estimated delivery in ${etaLabel}.` : "Our team confirms delivery availability and timelines after order review."),
    };
  }

  return {
    label: "Shipping included in your order total",
    detail: note ?? (etaLabel ? `Estimated delivery in ${etaLabel}.` : "Delivery timing is confirmed once the order is processed."),
  };
};
