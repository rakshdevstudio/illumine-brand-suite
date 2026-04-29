/**
 * BarcodeLabelModal.tsx
 * Premium barcode preview + download + print modal for the Illume admin panel.
 */

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Printer, Image as ImageIcon, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as JsBarcode from "jsbarcode";
import {
  type LabelData,
  type LabelSize,
  downloadLabelPng,
  downloadLabelsPdf,
  printLabel,
} from "@/lib/barcode";

interface BarcodeLabelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labelData: LabelData | null;
}

const LABEL_SIZES: { value: LabelSize; label: string }[] = [
  { value: "100x50", label: "100mm × 50mm (Standard)" },
  { value: "75x50", label: "75mm × 50mm (Compact)" },
];

const formatPrice = (price: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);

export default function BarcodeLabelModal({
  open,
  onOpenChange,
  labelData,
}: BarcodeLabelModalProps) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [labelSize, setLabelSize] = useState<LabelSize>("100x50");
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  useEffect(() => {
    if (!open || !labelData?.barcodeValue || !barcodeRef.current) return;
    try {
      JsBarcode(barcodeRef.current, labelData.barcodeValue, {
        format: "CODE128",
        width: 2,
        height: 72,
        displayValue: true,
        font: "monospace",
        fontSize: 12,
        margin: 8,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch (e) {
      // invalid barcode value — safe to ignore in UI
    }
  }, [open, labelData]);

  if (!labelData) return null;

  const handleDownloadPng = () => {
    try {
      downloadLabelPng(labelData, labelSize);
      toast.success("PNG label downloaded");
    } catch {
      toast.error("Failed to generate PNG label");
    }
  };

  const handleDownloadPdf = async () => {
    setIsPdfLoading(true);
    try {
      await downloadLabelsPdf(
        [labelData],
        labelSize,
        `ILLUME-label-${labelData.barcodeValue}.pdf`
      );
      toast.success("PDF label downloaded");
    } catch {
      toast.error("Failed to generate PDF label");
    } finally {
      setIsPdfLoading(false);
    }
  };

  const handlePrint = () => {
    try {
      printLabel(labelData, labelSize);
      toast.info("Print dialog opened");
    } catch {
      toast.error("Failed to open print dialog");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-sm font-light tracking-[0.18em] uppercase">
            Barcode Label
          </DialogTitle>
        </DialogHeader>

        {/* Label Preview Card */}
        <div className="mt-2 rounded-2xl border border-border bg-white p-6 shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
          {/* Brand header */}
          <p className="text-center text-[10px] font-semibold tracking-[0.5em] uppercase text-neutral-900 mb-3">
            ILLUME
          </p>

          {/* Barcode */}
          <div className="flex justify-center">
            <svg ref={barcodeRef} className="max-w-full" />
          </div>

          <div className="mt-4 space-y-1 text-center">
            {/* Product name */}
            <p className="text-sm font-semibold tracking-tight text-neutral-900 truncate px-2">
              {labelData.productName}
            </p>

            {/* Size · Price */}
            <p className="text-sm text-neutral-600">
              Size: <span className="font-medium">{labelData.size}</span>
              <span className="mx-2 text-neutral-300">·</span>
              <span className="font-semibold text-neutral-900">{formatPrice(labelData.price)}</span>
            </p>

            {/* School · Class */}
            {(labelData.schoolName || labelData.className) && (
              <p className="text-xs text-neutral-400 tracking-wide">
                {[labelData.schoolName, labelData.className].filter(Boolean).join(" · ")}
              </p>
            )}

            {/* Brand footer */}
            <p className="text-[10px] text-neutral-300 tracking-widest uppercase pt-1">
              Brand: ILLUME
            </p>
          </div>
        </div>

        {/* Barcode value */}
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-neutral-50 px-4 py-2.5">
          <span className="text-xs text-muted-foreground uppercase tracking-[0.15em]">Barcode</span>
          <span className="font-mono text-sm font-medium tracking-widest text-neutral-900">
            {labelData.barcodeValue}
          </span>
        </div>

        {/* Label Size Selector */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground uppercase tracking-[0.15em] shrink-0">Label Size</span>
          <Select value={labelSize} onValueChange={(v) => setLabelSize(v as LabelSize)}>
            <SelectTrigger className="h-9 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LABEL_SIZES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-10 text-xs tracking-[0.1em] uppercase gap-1.5"
            onClick={handleDownloadPng}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            PNG
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-10 text-xs tracking-[0.1em] uppercase gap-1.5"
            onClick={handleDownloadPdf}
            disabled={isPdfLoading}
          >
            {isPdfLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            PDF
          </Button>

          <Button
            size="sm"
            className="h-10 text-xs tracking-[0.1em] uppercase gap-1.5"
            onClick={handlePrint}
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
