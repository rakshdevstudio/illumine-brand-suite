import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Link } from "react-router-dom";



export type InvoiceItemView = {
  id: string;
  product_name: string;
  variant_size: string;
  quantity: number;
  unit_price: number;
  gst_percentage: number;
  cgst_amount: number;
  sgst_amount: number;
  total: number;
};

export type InvoiceView = {
  id: string;
  order_id: string;
  invoice_number: string;
  customer_name: string;
  phone: string;
  address: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
  company_name?: string | null;
  company_gstin?: string | null;
  company_address?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  created_at: string;
  invoice_items: InvoiceItemView[];
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(
    Number(value || 0),
  );

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const toPdfText = (value: string) =>
  String(value ?? "")
    .replace(/₹/g, "INR ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

export const InvoiceDocument = ({
  invoice,
  showActions = true,
}: {
  invoice: InvoiceView;
  showActions?: boolean;
}) => {
  const handlePrint = () => window.print();

  const handleDownloadPdf = async () => {
    try {
      const pdfDoc = await PDFDocument.create();
      const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      let page = pdfDoc.addPage([595.28, 841.89]);
      let y = 800;
      const left = 36;
      const right = 559;

      const drawText = (
        text: string,
        x: number,
        py: number,
        size = 10,
        weight: "regular" | "bold" = "regular",
        align: "left" | "right" = "left",
      ) => {
        const content = toPdfText(text);
        const font = weight === "bold" ? bold : regular;
        const width = font.widthOfTextAtSize(content, size);
        const tx = align === "right" ? x - width : x;
        page.drawText(content, {
          x: tx,
          y: py,
          size,
          font,
          color: rgb(0, 0, 0),
        });
      };

      const drawLine = (py: number, thickness = 1) => {
        page.drawLine({
          start: { x: left, y: py },
          end: { x: right, y: py },
          thickness,
          color: rgb(0, 0, 0),
        });
      };

      const newPage = () => {
        page = pdfDoc.addPage([595.28, 841.89]);
        y = 800;
      };

      drawText("ILLUME", left, y, 18, "bold");
      drawText("Tax Invoice", right, y + 4, 12, "bold", "right");
      y -= 18;
      drawText(invoice.company_name || "Illume Uniforms Pvt. Ltd.", left, y);
      drawText("Invoice No: " + (invoice.invoice_number || "-"), right, y, 10, "bold", "right");
      y -= 14;
      
      const addressLines = (invoice.company_address || "Income Tax Layout, 273, 5th Cross Rd, 8 Block, Govindaraja Nagar Ward, Naagarabhaavi, Bengaluru, Karnataka 560072").split('\n');
      for(const line of addressLines) {
        drawText(line, left, y, 9);
        y -= 12;
      }
      y -= 2; // adjust

      drawText("Invoice Date: " + formatDate(invoice.created_at), right, y + 14, 10, "bold", "right");
      drawText("GSTIN: " + (invoice.company_gstin || "29ABCDE1234F1Z5"), left, y, 9);
      if (invoice.company_phone) {
        y -= 12;
        drawText("Phone: " + invoice.company_phone, left, y, 9);
      }
      if (invoice.company_email) {
        y -= 12;
        drawText("Email: " + invoice.company_email, left, y, 9);
      }

      y -= 10;
      drawLine(y);
      y -= 16;

      drawText("Bill To", left, y, 10, "bold");
      y -= 14;
      drawText("Customer Name: " + (invoice.customer_name || "-"), left, y);
      y -= 13;
      drawText("Phone: " + (invoice.phone || "-"), left, y);
      y -= 13;
      drawText("Address: " + (invoice.address || "-"), left, y);

      y -= 14;
      drawLine(y);
      y -= 16;

      const cols = {
        idx: left,
        product: left + 24,
        size: left + 202,
        qty: left + 250,
        price: left + 292,
        gst: left + 356,
        cgst: left + 410,
        sgst: left + 468,
        total: right,
      };

      drawText("#", cols.idx, y, 9, "bold");
      drawText("Product", cols.product, y, 9, "bold");
      drawText("Size", cols.size, y, 9, "bold");
      drawText("Qty", cols.qty + 24, y, 9, "bold", "right");
      drawText("Price", cols.price + 58, y, 9, "bold", "right");
      drawText("GST %", cols.gst + 40, y, 9, "bold", "right");
      drawText("CGST", cols.cgst + 45, y, 9, "bold", "right");
      drawText("SGST", cols.sgst + 45, y, 9, "bold", "right");
      drawText("Total", cols.total, y, 9, "bold", "right");
      y -= 8;
      drawLine(y);
      y -= 12;

      for (let i = 0; i < invoice.invoice_items.length; i += 1) {
        const item = invoice.invoice_items[i];

        if (y < 120) {
          newPage();
          drawText("Invoice # " + (invoice.invoice_number || "-"), left, y, 10, "bold");
          y -= 16;
        }

        drawText(String(i + 1), cols.idx, y, 9);
        drawText(item.product_name || "Product", cols.product, y, 9);
        drawText(item.variant_size || "-", cols.size, y, 9);
        drawText(String(item.quantity || 0), cols.qty + 24, y, 9, "regular", "right");
        drawText(formatNumber(item.unit_price), cols.price + 58, y, 9, "regular", "right");
        drawText(formatNumber(item.gst_percentage), cols.gst + 40, y, 9, "regular", "right");
        drawText(formatNumber(item.cgst_amount), cols.cgst + 45, y, 9, "regular", "right");
        drawText(formatNumber(item.sgst_amount), cols.sgst + 45, y, 9, "regular", "right");
        drawText(formatNumber(item.total), cols.total, y, 9, "regular", "right");
        y -= 14;
      }

      y -= 4;
      drawLine(y);
      y -= 16;

      const summaryX = right;
      drawText("Subtotal: " + formatCurrency(invoice.subtotal), summaryX, y, 10, "regular", "right");
      y -= 14;
      drawText("CGST: " + formatCurrency(invoice.cgst), summaryX, y, 10, "regular", "right");
      y -= 14;
      drawText("SGST: " + formatCurrency(invoice.sgst), summaryX, y, 10, "regular", "right");
      y -= 18;
      drawText("Grand Total: " + formatCurrency(invoice.total), summaryX, y, 12, "bold", "right");

      const bytes = await pdfDoc.save();
      const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeNo = String(invoice.invoice_number || "invoice").replace(/[^a-zA-Z0-9-_]/g, "_");
      a.download = `${safeNo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Failed to generate PDF.");
    }
  };

  return (
    <div id="invoice-print-root" className="mx-auto w-full max-w-[900px] bg-white text-black">
      <div className="mb-4 flex items-center justify-end gap-2 print:hidden">
        {showActions && (
          <>
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              Download PDF
            </Button>
            <Button size="sm" onClick={handlePrint}>
              Print Invoice
            </Button>
          </>
        )}
      </div>

      <div className="border border-black p-6">
        <div className="grid grid-cols-2 gap-4 border-b border-black pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-wide">ILLUME</h1>
            <p className="text-xs leading-5">{invoice.company_name || "Illume Uniforms Pvt. Ltd."}</p>
            <p className="text-xs leading-5 whitespace-pre-wrap">{invoice.company_address || "Income Tax Layout, 273, 5th Cross Rd, 8 Block, Govindaraja Nagar Ward, Naagarabhaavi, Bengaluru, Karnataka 560072"}</p>
            <p className="text-xs leading-5">GSTIN: {invoice.company_gstin || "29ABCDE1234F1Z5"}</p>
            {invoice.company_phone && <p className="text-xs leading-5">Phone: {invoice.company_phone}</p>}
            {invoice.company_email && <p className="text-xs leading-5">Email: {invoice.company_email}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase">Tax Invoice</p>
            <p className="mt-3 text-sm">
              <span className="font-semibold">Invoice No:</span> {invoice.invoice_number || "-"}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Order ID:</span>{" "}
              {invoice.order_id ? (
                <Link to={`/admin/orders/${invoice.order_id}`} className="font-mono text-primary hover:underline">
                  {invoice.order_id.slice(0, 8).toUpperCase()}
                </Link>
              ) : (
                "-"
              )}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Invoice Date:</span> {formatDate(invoice.created_at)}
            </p>
          </div>
        </div>

        <div className="border-b border-black py-4">
          <p className="text-xs font-semibold uppercase tracking-wide">Bill To</p>
          <p className="mt-2 text-sm">
            <span className="font-semibold">Customer Name:</span> {invoice.customer_name || "-"}
          </p>
          <p className="text-sm">
            <span className="font-semibold">Phone:</span> {invoice.phone || "-"}
          </p>
          <p className="text-sm">
            <span className="font-semibold">Address:</span> {invoice.address || "-"}
          </p>
        </div>

        <div className="overflow-x-auto py-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-black px-2 py-2 text-left">#</th>
                <th className="border border-black px-2 py-2 text-left">Product</th>
                <th className="border border-black px-2 py-2 text-left">Size</th>
                <th className="border border-black px-2 py-2 text-right">Qty</th>
                <th className="border border-black px-2 py-2 text-right">Price</th>
                <th className="border border-black px-2 py-2 text-right">GST %</th>
                <th className="border border-black px-2 py-2 text-right">CGST</th>
                <th className="border border-black px-2 py-2 text-right">SGST</th>
                <th className="border border-black px-2 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.invoice_items.map((item, index) => (
                <tr key={item.id}>
                  <td className="border border-black px-2 py-2">{index + 1}</td>
                  <td className="border border-black px-2 py-2">{item.product_name || "Product"}</td>
                  <td className="border border-black px-2 py-2">{item.variant_size || "-"}</td>
                  <td className="border border-black px-2 py-2 text-right">{item.quantity}</td>
                  <td className="border border-black px-2 py-2 text-right">{formatNumber(item.unit_price)}</td>
                  <td className="border border-black px-2 py-2 text-right">{formatNumber(item.gst_percentage)}</td>
                  <td className="border border-black px-2 py-2 text-right">{formatNumber(item.cgst_amount)}</td>
                  <td className="border border-black px-2 py-2 text-right">{formatNumber(item.sgst_amount)}</td>
                  <td className="border border-black px-2 py-2 text-right">{formatNumber(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto w-full max-w-[320px] border border-black">
          <div className="flex items-center justify-between border-b border-black px-3 py-2 text-sm">
            <span>Subtotal</span>
            <span>{formatCurrency(invoice.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between border-b border-black px-3 py-2 text-sm">
            <span>CGST</span>
            <span>{formatCurrency(invoice.cgst)}</span>
          </div>
          <div className="flex items-center justify-between border-b border-black px-3 py-2 text-sm">
            <span>SGST</span>
            <span>{formatCurrency(invoice.sgst)}</span>
          </div>
          <div className="flex items-center justify-between bg-neutral-100 px-3 py-2 text-base font-bold">
            <span>Grand Total</span>
            <span>{formatCurrency(invoice.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
