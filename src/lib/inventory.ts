export const LOW_STOCK_LIMIT = 5;

export const getLowStockThreshold = (value?: number | null) =>
	typeof value === "number" && Number.isFinite(value) ? value : LOW_STOCK_LIMIT;

export const isLowStock = (stock: number, threshold?: number | null) =>
	stock <= getLowStockThreshold(threshold);
