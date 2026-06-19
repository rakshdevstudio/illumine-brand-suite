import { useState, useRef } from "react";
import Papa from "papaparse";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, UploadCloud, XCircle, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export type ImportRowResult = {
  originalRow: Record<string, unknown>;
  status: "valid" | "warning" | "error" | "skip";
  messages: string[];
};

interface BulkImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  expectedColumns: string[];
  onValidate: (rows: Record<string, unknown>[]) => Promise<ImportRowResult[]>;
  onImport: (validRows: Record<string, unknown>[]) => Promise<void>;
  sampleCsvUrl?: string;
}

export function BulkImportModal({
  open,
  onOpenChange,
  title,
  expectedColumns,
  onValidate,
  onImport,
  sampleCsvUrl,
}: BulkImportModalProps) {
  const [step, setStep] = useState<"upload" | "validating" | "preview" | "importing">("upload");
  const [parsedRows, setParsedRows] = useState<ImportRowResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep("validating");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const validationResults = await onValidate(results.data as Record<string, unknown>[]);
          setParsedRows(validationResults);
          setStep("preview");
        } catch (err) {
          console.error(err);
          setStep("upload");
        }
      },
      error: (error) => {
        console.error(error);
        setStep("upload");
      }
    });
  };

  const handleConfirm = async () => {
    const validRows = parsedRows.filter(r => r.status === "valid" || r.status === "warning").map(r => r.originalRow);
    setStep("importing");
    try {
      await onImport(validRows);
      onOpenChange(false);
      reset();
    } catch (err) {
      console.error(err);
      setStep("preview");
    }
  };

  const reset = () => {
    setStep("upload");
    setParsedRows([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const validCount = parsedRows.filter(r => r.status === "valid" || r.status === "warning").length;
  const skipCount = parsedRows.filter(r => r.status === "skip").length;
  const errorCount = parsedRows.filter(r => r.status === "error").length;

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) reset(); onOpenChange(val); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Upload a CSV file to bulk import records. Default action on duplicates is to SKIP.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-border rounded-lg bg-muted/50">
            <UploadCloud className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="mb-2 text-sm text-muted-foreground">Select a CSV file to upload</p>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <Button onClick={() => fileInputRef.current?.click()}>Browse Files</Button>
            {sampleCsvUrl && (
              <Button variant="link" size="sm" className="mt-4 text-xs" onClick={() => window.open(sampleCsvUrl)}>
                Download Sample CSV
              </Button>
            )}
            <div className="mt-6 text-xs text-muted-foreground text-center">
              Expected columns:<br />
              <span className="font-mono">{expectedColumns.join(", ")}</span>
            </div>
          </div>
        )}

        {step === "validating" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p>Validating records against database...</p>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-4 mb-4">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                {validCount} Valid / Warning
              </Badge>
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                {skipCount} Skipped (Duplicates)
              </Badge>
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                {errorCount} Errors
              </Badge>
            </div>
            
            <ScrollArea className="flex-1 border rounded-md min-h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Status</TableHead>
                    {expectedColumns.map(col => <TableHead key={col}>{col}</TableHead>)}
                    <TableHead>Messages</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {row.status === "valid" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        {row.status === "warning" && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                        {row.status === "skip" && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                        {row.status === "error" && <XCircle className="w-4 h-4 text-red-500" />}
                      </TableCell>
                      {expectedColumns.map(col => (
                        <TableCell key={col} className="truncate max-w-[150px]">
                          {String(row.originalRow[col] ?? "")}
                        </TableCell>
                      ))}
                      <TableCell className="text-xs text-muted-foreground">
                        {row.messages.join(", ")}
                        {row.status === "skip" && row.messages.length === 0 && "Duplicate record, will be skipped"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button 
                onClick={handleConfirm} 
                disabled={validCount === 0 || errorCount > 0}
              >
                Import {validCount} Records
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p>Importing records to database...</p>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
