/**
 * barcode.ts
 * Client-side barcode generation utilities for the Illume label + POS scan system.
 * Uses JsBarcode (CODE128) for barcode rendering.
 * Uses pdf-lib (already installed) for PDF generation.
 */

import * as JsBarcode from "jsbarcode";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// ── Types ─────────────────────────────────────────────────────────────────

export type LabelSize = "100x50" | "75x50";

export interface LabelData {
  barcodeValue: string;
  productName: string;
  size: string;
  price: number;
  schoolName?: string;
  className?: string;
  color?: string;
  gender?: string;
}

// ── Barcode SVG/Canvas ─────────────────────────────────────────────────────

/**
 * Renders a CODE128 barcode onto a canvas element, returning the data URL (PNG).
 */
export function renderBarcodeToDataUrl(value: string, options?: { width?: number; height?: number }): string {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, {
    format: "CODE128",
    width: options?.width ?? 2,
    height: options?.height ?? 60,
    displayValue: true,
    font: "monospace",
    fontSize: 11,
    margin: 6,
    background: "#ffffff",
    lineColor: "#000000",
  });
  return canvas.toDataURL("image/png");
}

/**
 * Renders barcode to canvas and returns the HTMLCanvasElement directly
 * (used for embedding in the PDF).
 */
function renderBarcodeToCanvas(value: string, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, {
    format: "CODE128",
    width: 2,
    height: height,
    displayValue: true,
    font: "monospace",
    fontSize: 11,
    margin: 6,
    background: "#ffffff",
    lineColor: "#000000",
  });
  return canvas;
}

// ── PNG Export ─────────────────────────────────────────────────────────────

/**
 * Generates a full label PNG (rendered via an offscreen canvas).
 * Returns a Blob URL for download.
 */
export function generateLabelPng(data: LabelData, labelSize: LabelSize = "100x50"): string {
  const [mmW, mmH] = labelSize === "100x50" ? [100, 50] : [75, 50];

  // 3px/mm at ~96dpi ≈ 11.4px/mm; we use 4px/mm for crisp print quality
  const PX_PER_MM = 4;
  const W = mmW * PX_PER_MM;
  const H = mmH * PX_PER_MM;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Border
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 1;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  const pad = 10 * PX_PER_MM * 0.5;

  // ILLUME brand header
  ctx.fillStyle = "#000000";
  ctx.font = `bold ${6 * PX_PER_MM * 0.45}px 'Arial', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("ILLUME", W / 2, pad + 6 * PX_PER_MM * 0.45);

  // Barcode
  const bcCanvas = renderBarcodeToCanvas(data.barcodeValue, W - pad * 2, 14 * PX_PER_MM * 0.5);
  const bcX = (W - bcCanvas.width) / 2;
  const bcY = pad + 8 * PX_PER_MM * 0.5;
  ctx.drawImage(bcCanvas, bcX, bcY);

  // Product name
  const labelStartY = bcY + bcCanvas.height + 5 * PX_PER_MM * 0.45;
  ctx.font = `bold ${5 * PX_PER_MM * 0.45}px 'Arial', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#111111";
  const productLabel = data.productName.length > 30 ? data.productName.slice(0, 28) + "…" : data.productName;
  ctx.fillText(productLabel, W / 2, labelStartY);

  // Size + Price
  ctx.font = `${4.5 * PX_PER_MM * 0.45}px 'Arial', sans-serif`;
  ctx.fillStyle = "#333333";
  ctx.fillText(`Size: ${data.size}   ₹${data.price.toFixed(0)}`, W / 2, labelStartY + 5 * PX_PER_MM * 0.45);

  // Optional school/class
  if (data.schoolName || data.className) {
    ctx.font = `${3.8 * PX_PER_MM * 0.45}px 'Arial', sans-serif`;
    ctx.fillStyle = "#666666";
    ctx.fillText(
      [data.schoolName, data.className].filter(Boolean).join(" · "),
      W / 2,
      labelStartY + 10 * PX_PER_MM * 0.45
    );
  }

  // Bottom brand line
  ctx.font = `${3.5 * PX_PER_MM * 0.45}px 'Arial', sans-serif`;
  ctx.fillStyle = "#999999";
  ctx.fillText("Brand: ILLUME", W / 2, H - 5);

  return canvas.toDataURL("image/png");
}

/**
 * Triggers download of a PNG label.
 */
export function downloadLabelPng(data: LabelData, labelSize: LabelSize = "100x50"): void {
  const dataUrl = generateLabelPng(data, labelSize);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `ILLUME-label-${data.barcodeValue}.png`;
  a.click();
}

// ── PDF Export ─────────────────────────────────────────────────────────────

/**
 * Generates a multi-label PDF.
 * Labels are arranged 2-per-row on A4 by default.
 * Returns a Uint8Array of the PDF bytes.
 */
export async function generateLabelsPdf(
  labels: LabelData[],
  labelSize: LabelSize = "100x50"
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PT_PER_MM = 2.8346;
  const [mmW, mmH] = labelSize === "100x50" ? [100, 50] : [75, 50];
  const labelW = mmW * PT_PER_MM;
  const labelH = mmH * PT_PER_MM;

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;
  const MARGIN = 20;
  const COLS = Math.floor((PAGE_W - MARGIN * 2) / labelW);
  const ROWS = Math.floor((PAGE_H - MARGIN * 2) / labelH);
  const PER_PAGE = COLS * ROWS;

  const pages = Math.ceil(labels.length / PER_PAGE);

  for (let pageIdx = 0; pageIdx < pages; pageIdx++) {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const pageLabels = labels.slice(pageIdx * PER_PAGE, (pageIdx + 1) * PER_PAGE);

    for (let i = 0; i < pageLabels.length; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = MARGIN + col * labelW;
      // pdf-lib origin is bottom-left; we need to flip Y
      const y = PAGE_H - MARGIN - (row + 1) * labelH;

      const lData = pageLabels[i];

      // Border
      page.drawRectangle({
        x,
        y,
        width: labelW,
        height: labelH,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 0.5,
      });

      const pad = 8;

      // Brand header
      const brandText = "ILLUME";
      const brandSize = 8;
      const brandW = fontBold.widthOfTextAtSize(brandText, brandSize);
      page.drawText(brandText, {
        x: x + labelW / 2 - brandW / 2,
        y: y + labelH - pad - brandSize,
        size: brandSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Separator line
      page.drawLine({
        start: { x: x + pad, y: y + labelH - pad - brandSize - 3 },
        end: { x: x + labelW - pad, y: y + labelH - pad - brandSize - 3 },
        thickness: 0.3,
        color: rgb(0.7, 0.7, 0.7),
      });

      // Barcode image from canvas
      const bcCanvas = renderBarcodeToCanvas(lData.barcodeValue, labelW - pad * 2, 40);
      const bcDataUrl = bcCanvas.toDataURL("image/png");
      const bcBase64 = bcDataUrl.split(",")[1];
      const bcBytes = Uint8Array.from(atob(bcBase64), (c) => c.charCodeAt(0));
      const bcImage = await pdfDoc.embedPng(bcBytes);

      const bcW = Math.min(bcCanvas.width, labelW - pad * 2);
      const bcH = (bcCanvas.height / bcCanvas.width) * bcW;
      const bcX = x + labelW / 2 - bcW / 2;
      const bcY = y + labelH - pad - brandSize - 6 - bcH;

      page.drawImage(bcImage, { x: bcX, y: bcY, width: bcW, height: bcH });

      // Product name
      const productFontSize = 7;
      const productText = lData.productName.length > 32 ? lData.productName.slice(0, 30) + "…" : lData.productName;
      const productW = fontBold.widthOfTextAtSize(productText, productFontSize);
      page.drawText(productText, {
        x: x + labelW / 2 - productW / 2,
        y: bcY - 10,
        size: productFontSize,
        font: fontBold,
        color: rgb(0.05, 0.05, 0.05),
      });

      // Size + Price
      const detailFontSize = 6.5;
      const detailText = `Size: ${lData.size}   ₹${lData.price.toFixed(0)}`;
      const detailW = font.widthOfTextAtSize(detailText, detailFontSize);
      page.drawText(detailText, {
        x: x + labelW / 2 - detailW / 2,
        y: bcY - 20,
        size: detailFontSize,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
      });

      // School/class
      if (lData.schoolName || lData.className) {
        const meta = [lData.schoolName, lData.className].filter(Boolean).join(" · ");
        const metaFontSize = 5.5;
        const metaW = font.widthOfTextAtSize(meta, metaFontSize);
        page.drawText(meta, {
          x: x + labelW / 2 - metaW / 2,
          y: bcY - 30,
          size: metaFontSize,
          font: font,
          color: rgb(0.45, 0.45, 0.45),
        });
      }

      // Bottom brand
      const bottomText = "Brand: ILLUME";
      const bottomSize = 5;
      const bottomW = font.widthOfTextAtSize(bottomText, bottomSize);
      page.drawText(bottomText, {
        x: x + labelW / 2 - bottomW / 2,
        y: y + 5,
        size: bottomSize,
        font: font,
        color: rgb(0.6, 0.6, 0.6),
      });
    }
  }

  return pdfDoc.save();
}

/**
 * Triggers download of a PDF containing one or more labels.
 */
export async function downloadLabelsPdf(
  labels: LabelData[],
  labelSize: LabelSize = "100x50",
  filename = "ILLUME-labels.pdf"
): Promise<void> {
  const pdfBytes = await generateLabelsPdf(labels, labelSize);
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Opens the browser print dialog for a single label.
 * Renders label to a hidden iframe and prints it.
 */
export function printLabel(data: LabelData, labelSize: LabelSize = "100x50"): void {
  const pngDataUrl = generateLabelPng(data, labelSize);
  const [mmW, mmH] = labelSize === "100x50" ? [100, 50] : [75, 50];

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow!.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head>
    <style>
      @page { size: ${mmW}mm ${mmH}mm; margin: 0; }
      body { margin: 0; padding: 0; }
      img { width: ${mmW}mm; height: ${mmH}mm; display: block; }
    </style>
  </head><body>
    <img src="${pngDataUrl}" />
  </body></html>`);
  doc.close();

  iframe.contentWindow!.onload = () => {
    iframe.contentWindow!.print();
    setTimeout(() => iframe.remove(), 3000);
  };
}

/**
 * Prints multiple labels at once via PDF.
 */
export async function printLabels(labels: LabelData[], labelSize: LabelSize = "100x50"): Promise<void> {
  const pdfBytes = await generateLabelsPdf(labels, labelSize);
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none";
  iframe.src = url;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    iframe.contentWindow!.print();
    setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 5000);
  };
}
