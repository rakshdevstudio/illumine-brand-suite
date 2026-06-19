/**
 * BarcodeLabelModal.tsx
 * Premium barcode preview + download + print modal for the Illume admin panel.
 * Optimized: barcode data URL is memoized and only regenerated when barcodeValue changes.
 */

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Image as ImageIcon, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  type LabelData,
  generateLabelPng,
  downloadLabelPng,
  downloadLabelsPdf,
  downloadLabelTspl,
  printLabel,
} from "@/lib/barcode";

interface BarcodeLabelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labelData: LabelData | null;
}

export default function BarcodeLabelModal({
  open,
  onOpenChange,
  labelData,
}: BarcodeLabelModalProps) {
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  // ── Memoize exact printable label PNG ──
  const labelSrc = useMemo(() => {
    if (!labelData?.barcodeValue) return "";
    try {
      // Generate the exact 60x40mm high-res label for the preview
      return generateLabelPng(labelData);
    } catch {
      return "";
    }
  }, [labelData]);

  if (!labelData) return null;

  const handleDownloadPng = () => {
    try {
      downloadLabelPng(labelData);
      toast.success("PNG label downloaded");
    } catch {
      toast.error("Failed to generate PNG label");
    }
  };

  const handleDownloadTspl = () => {
    try {
      downloadLabelTspl(labelData);
      toast.success("TSPL configuration downloaded");
    } catch {
      toast.error("Failed to generate TSPL configuration");
    }
  };

  const handleDownloadPdf = async () => {
    setIsPdfLoading(true);
    try {
      await downloadLabelsPdf(
        [labelData],
        `ILLUME-label-${labelData.barcodeValue}.pdf`
      );
      toast.success("PDF label downloaded");
    } catch (err) {
      console.error("PDF error:", err);
      toast.error("Failed to generate PDF label");
    } finally {
      setIsPdfLoading(false);
    }
  };

  const handlePrint = () => {
    try {
      printLabel(labelData);
      toast.info("Sending to printer…");
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

        {/* Label Preview Container */}
        <div className="mt-2 rounded-2xl border border-border bg-white p-6 shadow-[0_8px_32px_rgba(0,0,0,0.06)] flex flex-col items-center justify-center">
          <p className="text-xs text-muted-foreground uppercase tracking-[0.15em] mb-4">
            WYSIWYG Print Preview (60mm × 40mm)
          </p>

          {/* Actual generated label image */}
          {labelSrc ? (
            <img
              src={labelSrc}
              alt={`Barcode ${labelData.barcodeValue}`}
              className="max-w-full shadow-md border border-neutral-200"
              style={{
                aspectRatio: "60/40",
                objectFit: "contain",
                width: "100%",
                maxWidth: "360px", // Reasonable display width
              }}
            />
          ) : (
            <div className="h-40 w-full flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-md">
              Unable to render label
            </div>
          )}
        </div>

        {/* Barcode value */}
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-neutral-50 px-4 py-3">
          <span className="text-xs text-muted-foreground uppercase tracking-[0.15em]">Barcode</span>
          <span className="font-mono text-sm font-medium tracking-widest text-neutral-900">
            {labelData.barcodeValue}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-4 gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-10 text-[10px] tracking-wide uppercase gap-1"
            onClick={handleDownloadPng}
          >
            <ImageIcon className="h-3 w-3" />
            PNG
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-10 text-[10px] tracking-wide uppercase gap-1"
            onClick={handleDownloadTspl}
          >
            <FileText className="h-3 w-3" />
            TSPL
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-10 text-[10px] tracking-wide uppercase gap-1"
            onClick={handleDownloadPdf}
            disabled={isPdfLoading}
          >
            {isPdfLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FileText className="h-3 w-3" />
            )}
            PDF
          </Button>

          <Button
            size="sm"
            className="h-10 text-[10px] tracking-wide uppercase gap-1"
            onClick={handlePrint}
          >
            <Printer className="h-3 w-3" />
            Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
