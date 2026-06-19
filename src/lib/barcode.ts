/**
 * barcode.ts
 * Client-side barcode generation utilities for the Illume label + POS scan system.
 * Uses JsBarcode (CODE128) for barcode rendering.
 * Uses pdf-lib for PDF generation.
 */

// Vite pre-bundles jsbarcode (CJS) → ESM, so the default import is the callable function.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – @types/jsbarcode uses export= but moduleResolution:bundler allows this
import JsBarcode from "jsbarcode";
import { PDFDocument } from "pdf-lib";

export const LABEL_WIDTH_MM = 60;
export const LABEL_HEIGHT_MM = 40;

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

/**
 * Renders a CODE128 barcode onto an offscreen canvas.
 * Match TSC TE210 203 DPI specification: 2 dots width, 90 dots height.
 */
function renderBarcodeCanvas(value: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, {
    format: "CODE128",
    width: 2,           // narrow bar width 2 dots
    height: 90,         // barcode height 90 dots
    displayValue: false, // Text is printed separately below barcode
    margin: 0,
    background: "#ffffff",
    lineColor: "#000000",
  });
  return canvas;
}

/**
 * Renders a barcode and returns its PNG data URL.
 */
export function renderBarcodeToDataUrl(value: string): string {
  const canvas = renderBarcodeCanvas(value);
  return canvas.toDataURL("image/png");
}

/**
 * Generates a complete label PNG at 203 DPI (TSC TE210 matching).
 * Canvas: 480 x 320 (60mm x 40mm).
 */
export function generateLabelPng(data: LabelData): string {
  const W = 480;
  const H = 320;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // ── Brand Header (10px -> ~22px) ──
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.font = `bold 22px Arial, sans-serif`;
  ctx.fillText("I L L U M E", W / 2, 30);

  // ── Barcode ──
  const bcCanvas = renderBarcodeCanvas(data.barcodeValue);
  const bcX = (W - bcCanvas.width) / 2;
  ctx.drawImage(bcCanvas, bcX, 40);

  // ── Barcode Text (~9px -> ~20px) ──
  ctx.font = `bold 20px monospace, sans-serif`;
  ctx.fillText(data.barcodeValue, W / 2, 155);

  // ── Product Name (10px -> ~22px) ──
  ctx.font = `bold 22px Arial, sans-serif`;
  const productLabel = data.productName.length > 32 ? data.productName.slice(0, 30) + "…" : data.productName;
  ctx.fillText(productLabel, W / 2, 190);

  // ── Size & Price (9px -> ~20px) ──
  ctx.font = `bold 20px Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(`Size: ${data.size}`, 40, 230);
  ctx.textAlign = "right";
  ctx.fillText(`₹${data.price.toFixed(0)}`, W - 40, 230);

  // ── School & Class (8px -> ~18px) ──
  if (data.schoolName || data.className) {
    ctx.font = `18px Arial, sans-serif`;
    ctx.textAlign = "left";
    if (data.schoolName) ctx.fillText(data.schoolName, 40, 265);
    ctx.textAlign = "right";
    if (data.className) ctx.fillText(data.className, W - 40, 265);
  }

  // ── Brand Footer (8px -> ~18px) ──
  ctx.textAlign = "center";
  ctx.font = `18px Arial, sans-serif`;
  ctx.fillText("Brand: ILLUME", W / 2, 300);

  return canvas.toDataURL("image/png");
}

/**
 * Generates exact TSPL commands for TSC TE210 printers.
 */
export function generateLabelTspl(data: LabelData): string {
  const centerText = (text: string, y: number, font: "2"|"3") => {
    const cw = font === "3" ? 14 : 12;
    const x = Math.max(0, 240 - (text.length * cw) / 2);
    return `TEXT ${Math.floor(x)},${y},"${font}",0,1,1,"${text}"`;
  };

  // Estimate CODE128 barcode width in dots (narrow bar = 2)
  const bcWidthDots = (11 * data.barcodeValue.length + 35) * 2;
  const bcX = Math.max(10, Math.floor((480 - bcWidthDots) / 2));

  let tspl = `SIZE 60 mm,40 mm
GAP 3 mm,0
DIRECTION 1
REFERENCE 0,0
OFFSET 0
SET TEAR ON
CLS
${centerText("I L L U M E", 15, "2")}
BARCODE ${bcX},45,"128",90,1,0,2,2,"${data.barcodeValue}"
${centerText(data.barcodeValue, 140, "2")}
${centerText(data.productName.substring(0, 30), 175, "3")}
TEXT 40,215,"3",0,1,1,"Size: ${data.size}"
TEXT 320,215,"3",0,1,1,"Rs.${data.price.toFixed(0)}"
`;

  if (data.schoolName || data.className) {
    tspl += `TEXT 40,250,"2",0,1,1,"${data.schoolName || ''}"\n`;
    tspl += `TEXT 340,250,"2",0,1,1,"${data.className || ''}"\n`;
  }

  tspl += `${centerText("Brand: ILLUME", 285, "2")}
PRINT 1
`;
  return tspl;
}

/**
 * Triggers a TSPL file download.
 */
export function downloadLabelTspl(data: LabelData): void {
  const tsplContent = generateLabelTspl(data);
  const blob = new Blob([tsplContent], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ILLUME-label-${data.barcodeValue}.tspl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Triggers a PNG label download.
 */
export function downloadLabelPng(data: LabelData): void {
  const dataUrl = generateLabelPng(data);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `ILLUME-label-${data.barcodeValue}.png`;
  a.click();
}

/**
 * Generates a PDF using pdf-lib.
 * Creates physical 60x40mm pages suitable for thermal label printers.
 */
export async function generateLabelsPdf(labels: LabelData[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  const PT_PER_MM = 2.834645;
  const PAGE_W = LABEL_WIDTH_MM * PT_PER_MM;
  const PAGE_H = LABEL_HEIGHT_MM * PT_PER_MM;

  for (const lData of labels) {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    
    // Embed the 300 DPI PNG perfectly scaled onto the PDF page
    const pngDataUrl = generateLabelPng(lData);
    const bcBase64 = pngDataUrl.split(",")[1];
    const bcBytes = Uint8Array.from(atob(bcBase64), (c) => c.charCodeAt(0));
    const image = await pdfDoc.embedPng(bcBytes);

    page.drawImage(image, {
      x: 0,
      y: 0,
      width: PAGE_W,
      height: PAGE_H
    });
  }

  return pdfDoc.save();
}

/**
 * Triggers download of a PDF containing one or more labels.
 */
export async function downloadLabelsPdf(
  labels: LabelData[],
  filename = "ILLUME-labels.pdf"
): Promise<void> {
  const pdfBytes: Uint8Array = await generateLabelsPdf(labels);
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
export function printLabel(data: LabelData): void {
  const pngDataUrl = generateLabelPng(data);

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow!.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head>
    <style>
      @page { size: 60mm 40mm; margin: 0; }
      html, body { width: 60mm; height: 40mm; margin: 0; overflow: hidden; padding: 0; }
      .barcode-label { 
        width: 60mm !important; 
        height: 40mm !important; 
        display: block;
        margin: 0;
        padding: 0;
      }
    </style>
  </head><body>
    <img src="${pngDataUrl}" class="barcode-label" />
  </body></html>`);
  doc.close();

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
export async function printLabels(labels: LabelData[]): Promise<void> {
  const pdfBytes: Uint8Array = await generateLabelsPdf(labels);
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
