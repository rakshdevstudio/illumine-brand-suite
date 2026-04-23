import { Loader2, ShieldAlert, Trash2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const ConfirmDeleteModal = ({
  open,
  onOpenChange,
  vendorName,
  purchaseCount,
  isPurchaseCountLoading,
  isDeleting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorName: string;
  purchaseCount: number;
  isPurchaseCountLoading: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md overflow-hidden rounded-[28px] border-white/60 bg-[linear-gradient(160deg,rgba(255,255,255,0.98),rgba(250,250,249,0.94))] p-0 shadow-[0_32px_120px_-44px_rgba(15,23,42,0.55)] backdrop-blur-xl">
        <div className="border-b border-rose-100/80 bg-[radial-gradient(circle_at_top_left,rgba(254,226,226,0.95),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,251,251,0.94))] px-6 pb-5 pt-6">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50 text-rose-600 shadow-sm">
            <Trash2 className="h-5 w-5" />
          </div>
          <AlertDialogHeader className="space-y-2 text-left">
            <AlertDialogTitle className="text-xl font-light tracking-[0.04em] text-slate-950">
              Delete vendor '{vendorName}'?
            </AlertDialogTitle>
            <AlertDialogDescription className="max-w-sm text-sm leading-6 text-slate-600">
              This vendor will be permanently deleted. Existing purchases will remain, but will no longer be linked to this vendor.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Purchase Impact</p>
            {isPurchaseCountLoading ? (
              <div className="mt-3 flex items-center gap-3">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-4 w-40" />
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-700">
                This vendor is used in <span className="font-semibold text-slate-950">{purchaseCount}</span> purchase{purchaseCount === 1 ? "" : "s"}.
              </p>
            )}
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">This action cannot be undone.</p>
              <p className="text-xs leading-5 text-amber-800/90">
                Purchase history stays intact, but the vendor record itself will be removed from the system.
              </p>
            </div>
          </div>
        </div>

        <AlertDialogFooter className="border-t border-slate-200/80 bg-white/80 px-6 py-4">
          <AlertDialogCancel className="rounded-full border-slate-200 bg-white px-5">Cancel</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              type="button"
              variant="destructive"
              className={cn(
                "rounded-full px-5 shadow-sm transition-colors",
                isDeleting && "cursor-wait hover:bg-destructive",
              )}
              onClick={(event) => {
                event.preventDefault();
                onConfirm();
              }}
              disabled={isDeleting}
              aria-label={`Delete vendor ${vendorName}`}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete Vendor
                </>
              )}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
