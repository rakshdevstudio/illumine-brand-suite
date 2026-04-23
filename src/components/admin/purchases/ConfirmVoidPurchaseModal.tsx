import { Loader2, ShieldAlert, WalletCards } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount || 0);

export const ConfirmVoidPurchaseModal = ({
  open,
  onOpenChange,
  purchaseNumber,
  total,
  isVoiding,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseNumber: string;
  total: number;
  isVoiding: boolean;
  onConfirm: () => void;
}) => {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isVoiding && !nextOpen) return;
        onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent className="max-w-md overflow-hidden rounded-[28px] border-white/60 bg-[linear-gradient(160deg,rgba(255,255,255,0.98),rgba(250,250,249,0.94))] p-0 shadow-[0_32px_120px_-44px_rgba(15,23,42,0.55)] backdrop-blur-xl">
        <div className="border-b border-rose-100/80 bg-[radial-gradient(circle_at_top_left,rgba(254,226,226,0.92),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,251,251,0.94))] px-6 pb-5 pt-6">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50 text-rose-600 shadow-sm">
            <WalletCards className="h-5 w-5" />
          </div>
          <AlertDialogHeader className="space-y-2 text-left">
            <AlertDialogTitle className="text-xl font-light tracking-[0.04em] text-slate-950">
              Void Purchase
            </AlertDialogTitle>
            <AlertDialogDescription className="max-w-sm text-sm leading-6 text-slate-600">
              This will reverse inventory and accounting impact of this purchase.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Purchase Snapshot</p>
            <div className="mt-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">Purchase Number</p>
                <p className="text-base font-semibold text-slate-950">{purchaseNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Total Amount</p>
                <p className="text-lg font-semibold text-slate-950">{formatCurrency(total)}</p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">This action cannot be undone.</p>
              <p className="text-xs leading-5 text-amber-800/90">
                The purchase will remain in the system for audit, but its stock and ledger impact will be reversed.
              </p>
            </div>
          </div>
        </div>

        <AlertDialogFooter className="border-t border-slate-200/80 bg-white/80 px-6 py-4">
          <AlertDialogCancel disabled={isVoiding} className="rounded-full border-slate-200 bg-white px-5">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              type="button"
              variant="destructive"
              className={cn("rounded-full px-5 shadow-sm transition-colors", isVoiding && "cursor-wait")}
              onClick={(event) => {
                event.preventDefault();
                onConfirm();
              }}
              disabled={isVoiding}
              aria-label={`Void purchase ${purchaseNumber}`}
            >
              {isVoiding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Voiding...
                </>
              ) : (
                "Void Purchase"
              )}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
