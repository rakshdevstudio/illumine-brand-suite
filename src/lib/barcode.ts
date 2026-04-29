/**
 * barcode.ts
 * Client-side barcode generation utilities for the Illume label + POS scan system.
 * Uses JsBarcode (CODE128) for barcode rendering.
 * Uses pdf-lib (already installed) for PDF generation.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const JsBarcode = require("jsbarcode") as (el: HTMLCanvasElement | SVGElement | HTMLImageElement, value: string, options?: Record<string, unknown>) => void;
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

// ── Barcode Canvas Helpers ─────────────────────────────────────────────────

/**
 * Renders a CODE128 barcode onto an offscreen canvas.
 * Returns the canvas — width/height are determined by JsBarcode automatically.
 */
function renderBarcodeCanvas(value: string, barcodeHeight = 60): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, {
    format: "CODE128",
    width: 2,           // bar thickness in px
    height: barcodeHeight,
    displayValue: true,
    font: "monospace",
    fontSize: 11,
    margin: 8,
    background: "#ffffff",
    lineColor: "#000000",
  });
  return canvas;
}

/**
 * Renders a barcode and returns its PNG data URL.
 * Used by the React modal for preview via <img>.
 */
export function renderBarcodeToDataUrl(value: string): string {
  const canvas = renderBarcodeCanvas(value, 60);
  return canvas.toDataURL("image/png");
}

// ── PNG Label Export ────────────────────────────────────────────────────────

/**
 * Generates a complete label PNG at high resolution (4px/mm).
 * Returns a base64 data URL suitable for download or printing.
 */
export function generateLabelPng(data: LabelData, labelSize: LabelSize = "100x50"): string {
  const [mmW, mmH] = labelSize === "100x50" ? [100, 50] : [75, 50];
  const PX_PER_MM = 4;
  const W = mmW * PX_PER_MM;  // e.g. 400px
  const H = mmH * PX_PER_MM;  // e.g. 200px

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // White background + border
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 1;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  const PAD = 12;
  let cursorY = PAD;

  // ── ILLUME header ──
  ctx.fillStyle = "#000000";
  ctx.font = `bold 14px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.letterSpacing = "6px";
  ctx.fillText("ILLUME", W / 2, cursorY + 14);
  cursorY += 22;

  // ── Separator ──
  ctx.strokeStyle = "#eeeeee";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(PAD, cursorY);
  ctx.lineTo(W - PAD, cursorY);
  ctx.stroke();
  cursorY += 8;

  // ── Barcode ──
  const bcCanvas = renderBarcodeCanvas(data.barcodeValue, 52);
  // Scale barcode to fit within label width with padding
  const maxBcW = W - PAD * 4;
  const scaleRatio = Math.min(1, maxBcW / bcCanvas.width);
  const bcW = bcCanvas.width * scaleRatio;
  const bcH = bcCanvas.height * scaleRatio;
  const bcX = (W - bcW) / 2;
  ctx.drawImage(bcCanvas, bcX, cursorY, bcW, bcH);
  cursorY += bcH + 8;

  // ── Product name ──
  ctx.font = `bold 13px Arial, sans-serif`;
  ctx.fillStyle = "#111111";
  ctx.textAlign = "center";
  ctx.letterSpacing = "0px";
  const productLabel = data.productName.length > 32 ? data.productName.slice(0, 30) + "…" : data.productName;
  ctx.fillText(productLabel, W / 2, cursorY + 13);
  cursorY += 20;

  // ── Size · Price ──
  ctx.font = `12px Arial, sans-serif`;
  ctx.fillStyle = "#333333";
  ctx.fillText(`Size: ${data.size}   ₹${data.price.toFixed(0)}`, W / 2, cursorY + 12);
  cursorY += 18;

  // ── School · Class ──
  if (data.schoolName || data.className) {
    ctx.font = `10px Arial, sans-serif`;
    ctx.fillStyle = "#777777";
    ctx.fillText([data.schoolName, data.className].filter(Boolean).join(" · "), W / 2, cursorY + 10);
    cursorY += 16;
  }

  // ── Brand footer ──
  ctx.font = `9px Arial, sans-serif`;
  ctx.fillStyle = "#aaaaaa";
  ctx.fillText("Brand: ILLUME", W / 2, H - 6);

  return canvas.toDataURL("image/png");
}

/**
 * Triggers a PNG label download.
 */
export function downloadLabelPng(data: LabelData, labelSize: LabelSize = "100x50"): void {
  const dataUrl = generateLabelPng(data, labelSize);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `ILLUME-label-${data.barcodeValue}.png`;
  a.click();
}

// ── PDF Label Export ────────────────────────────────────────────────────────

/**
 * Generates a multi-label PDF using pdf-lib.
 * Labels are arranged in a grid on A4 pages.
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
  const labelW = mmW * PT_PER_MM;  // pts
  const labelH = mmH * PT_PER_MM;

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;
  const MARGIN = 20;
  const COL_GAP = 4;
  const ROW_GAP = 4;
  const COLS = Math.max(1, Math.floor((PAGE_W - MARGIN * 2 + COL_GAP) / (labelW + COL_GAP)));
  const ROWS = Math.max(1, Math.floor((PAGE_H - MARGIN * 2 + ROW_GAP) / (labelH + ROW_GAP)));
  const PER_PAGE = COLS * ROWS;

  const totalPages = Math.ceil(labels.length / PER_PAGE);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const pageLabels = labels.slice(pageIdx * PER_PAGE, (pageIdx + 1) * PER_PAGE);

    for (let i = 0; i < pageLabels.length; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = MARGIN + col * (labelW + COL_GAP);
      const y = PAGE_H - MARGIN - (row + 1) * labelH - row * ROW_GAP;

      const lData = pageLabels[i];
      const pad = 6;

      // Border
      page.drawRectangle({
        x, y,
        width: labelW,
        height: labelH,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 0.5,
      });

      // ── Brand header ──
      const brandSize = 7;
      const brandText = "ILLUME";
      const brandW = fontBold.widthOfTextAtSize(brandText, brandSize);
      page.drawText(brandText, {
        x: x + labelW / 2 - brandW / 2,
        y: y + labelH - pad - brandSize,
        size: brandSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Separator
      page.drawLine({
        start: { x: x + pad, y: y + labelH - pad - brandSize - 2 },
        end: { x: x + labelW - pad, y: y + labelH - pad - brandSize - 2 },
        thickness: 0.3,
        color: rgb(0.85, 0.85, 0.85),
      });

      // ── Barcode image ──
      try {
        const bcCanvas = renderBarcodeCanvas(lData.barcodeValue, 36);
        const bcDataUrl = bcCanvas.toDataURL("image/png");
        const bcBase64 = bcDataUrl.split(",")[1];
        const bcBytes = Uint8Array.from(atob(bcBase64), (c) => c.charCodeAt(0));
        const bcImage = await pdfDoc.embedPng(bcBytes);

        const maxBcW = labelW - pad * 2;
        const bcAspect = bcCanvas.width / bcCanvas.height;
        const bcW = Math.min(maxBcW, bcCanvas.width);
        const bcH = bcW / bcAspect;
        const bcX = x + labelW / 2 - bcW / 2;
        const headerH = pad + brandSize + 4;
        const bcY = y + labelH - headerH - bcH - 2;

        page.drawImage(bcImage, { x: bcX, y: bcY, width: bcW, height: bcH });

        let textY = bcY - 9;

        // Product name
        const productSize = 6.5;
        const productText = lData.productName.length > 34 ? lData.productName.slice(0, 32) + "…" : lData.productName;
        const productW = fontBold.widthOfTextAtSize(productText, productSize);
        page.drawText(productText, {
          x: x + labelW / 2 - productW / 2,
          y: textY,
          size: productSize,
          font: fontBold,
          color: rgb(0.05, 0.05, 0.05),
        });
        textY -= 9;

        // Size · Price
        const detailSize = 6;
        const detailText = `Size: ${lData.size}   \u20B9${lData.price.toFixed(0)}`;
        const detailW = font.widthOfTextAtSize(detailText, detailSize);
        page.drawText(detailText, {
          x: x + labelW / 2 - detailW / 2,
          y: textY,
          size: detailSize,
          font: font,
          color: rgb(0.2, 0.2, 0.2),
        });
        textY -= 8;

        // School · Class
        if (lData.schoolName || lData.className) {
          const meta = [lData.schoolName, lData.className].filter(Boolean).join(" · ");
          const metaSize = 5.5;
          const metaW = font.widthOfTextAtSize(meta, metaSize);
          page.drawText(meta, {
            x: x + labelW / 2 - metaW / 2,
            y: textY,
            size: metaSize,
            font: font,
            color: rgb(0.5, 0.5, 0.5),
          });
        }
      } catch {
        // If barcode render fails for this label, draw a placeholder
        page.drawText("[Barcode error]", {
          x: x + pad,
          y: y + labelH / 2,
          size: 6,
          font: font,
          color: rgb(0.7, 0.1, 0.1),
        });
      }

      // Brand footer
      const footerSize = 5;
      const footerText = "Brand: ILLUME";
      const footerW = font.widthOfTextAtSize(footerText, footerSize);
      page.drawText(footerText, {
        x: x + labelW / 2 - footerW / 2,
        y: y + 4,
        size: footerSize,
        font: font,
        color: rgb(0.65, 0.65, 0.65),
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
  const pdfBytes: Uint8Array = await generateLabelsPdf(labels, labelSize);
  const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Opens the browser print dialog for a single label.
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

  // Give the iframe time to load the image before printing
  setTimeout(() => {
    try {
      iframe.contentWindow!.print();
    } finally {
      setTimeout(() => iframe.remove(), 3000);
    }
  }, 500);
}

/**
 * Prints multiple labels at once via a generated PDF blob.
 */
export async function printLabels(labels: LabelData[], labelSize: LabelSize = "100x50"): Promise<void> {
  const pdfBytes: Uint8Array = await generateLabelsPdf(labels, labelSize);
  const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
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
