import { useEffect, useMemo, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import illumeLogo from "@/assets/logo.png";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

const formatPdfCurrency = (value: number) => {
  const numeric = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value || 0);
  return `INR ${numeric}`;
};

const toPdfText = (value: string) =>
  value
    .replace(/₹/g, "INR ")
    .replace(/–/g, "-")
    .replace(/—/g, "-")
    .replace(/©/g, "(c)")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

const formatInvoiceDate = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const parseStudentFieldsFromNotes = (notes: Array<{ note?: string | null } | null | undefined> | undefined) => {
  const result = {
    studentName: "",
    grade: "",
    alternatePhone: "",
  };

  if (!notes?.length) return result;

  for (const entry of notes) {
    const note = entry?.note || "";
    if (!note) continue;

    const studentNameMatch = note.match(/Student Name:\s*(.+)/i);
    const gradeMatch = note.match(/Grade:\s*(.+)/i);
    const alternateMatch = note.match(/Alternate Phone:\s*(.+)/i);

    if (studentNameMatch?.[1] && !result.studentName) result.studentName = studentNameMatch[1].trim();
    if (gradeMatch?.[1] && !result.grade) result.grade = gradeMatch[1].trim();
    if (alternateMatch?.[1] && !result.alternatePhone) result.alternatePhone = alternateMatch[1].trim();

    if (result.studentName && result.grade && result.alternatePhone) break;
  }

  return result;
};

type InvoiceOrderItem = {
  id?: string | number;
  quantity: number;
  price: number;
  products?: { name?: string | null };
  product_variants?: { size?: string | null };
};

type InvoiceOrder = {
  id: string;
  customer_name: string;
  phone: string;
  alternate_phone: string | null;
  student_name: string | null;
  grade: string | null;
  address: string;
  city: string;
  pincode: string;
  total_amount: number;
  created_at: string;
  order_notes: Array<{ note?: string | null }>;
  order_items: InvoiceOrderItem[];
};

const InvoicePage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const hasPrintedRef = useRef(false);

  const { data: order, isLoading, error } = useQuery<InvoiceOrder | null>({
    queryKey: ["admin-invoice", orderId],
    enabled: !!orderId,
    queryFn: async () => {
    const withStudentFields = "id, customer_name, phone, alternate_phone, student_name, grade, address, city, pincode, total_amount, created_at, order_notes(note, created_at), order_items(quantity, price, products(name), product_variants(size))";
      const legacyFields = "id, customer_name, phone, address, city, pincode, total_amount, created_at, order_notes(note, created_at), order_items(quantity, price, products(name), product_variants(size))";
      const client = supabase as any;

      let { data, error } = await client
        .from("orders")
        .select(withStudentFields)
        .eq("id", orderId!)
        .single();

      if (error?.code === "PGRST204") {
        const msg = (error.message || "").toLowerCase();
        const missingStudentCols =
          msg.includes("alternate_phone") || msg.includes("student_name") || msg.includes("grade");

        if (missingStudentCols) {
          const fallback = await client
            .from("orders")
            .select(legacyFields)
            .eq("id", orderId!)
            .single();

          const fallbackData = fallback.data
            ? {
                ...fallback.data,
                alternate_phone: null,
                student_name: null,
                grade: null,
              }
            : null;

          if (fallback.error) throw fallback.error;
          return fallbackData as InvoiceOrder | null;
        }
      }

      if (error) throw error;
      return data as InvoiceOrder | null;
    },
  });

  const noteDerivedStudent = useMemo(() => parseStudentFieldsFromNotes(order?.order_notes), [order]);

  const studentName = order?.student_name || noteDerivedStudent.studentName || "-";
  const grade = order?.grade || noteDerivedStudent.grade || "-";
  const alternatePhoneRaw = order?.alternate_phone || noteDerivedStudent.alternatePhone || "";
  const alternatePhone = alternatePhoneRaw && alternatePhoneRaw !== "—" ? alternatePhoneRaw : "-";
  const invoiceTypeLabel = "INVOICE";

  const invoiceNumber = useMemo(() => {
    if (!order?.id) return "ILLUME-PREVIEW";
    return `ILLUME-${order.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  }, [order?.id]);

  const shortOrderId = useMemo(() => {
    if (!order?.id) return "-";
    return order.id.replace(/-/g, "").slice(0, 8).toUpperCase();
  }, [order?.id]);

  const items = order?.order_items ?? [];
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0),
    [items],
  );
  const shipping = 0;
  const tax = 0;
  const total = Number(order?.total_amount ?? subtotal + shipping + tax);

  useEffect(() => {
    const shouldAutoPrint = searchParams.get("autoprint") === "1";
    if (!order || !shouldAutoPrint || hasPrintedRef.current) return;

    hasPrintedRef.current = true;
    const timer = window.setTimeout(() => {
      window.print();
    }, 150);

    return () => window.clearTimeout(timer);
  }, [order, searchParams]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!order) return;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const medium = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    try {
      const logoBytes = await fetch(illumeLogo).then((res) => res.arrayBuffer());
      const isJpeg = /\.jpe?g($|\?)/i.test(illumeLogo);
      const logoImage = isJpeg ? await pdfDoc.embedJpg(logoBytes) : await pdfDoc.embedPng(logoBytes);

      page.drawRectangle({
        x: 40,
        y: 760,
        width: 42,
        height: 42,
        color: rgb(0, 0, 0),
      });

      page.drawImage(logoImage, {
        x: 44,
        y: 764,
        width: 34,
        height: 34,
      });

      page.drawImage(logoImage, {
        x: 220,
        y: 325,
        width: 160,
        height: 160,
        opacity: 0.08,
      });
    } catch {
      // Logo is optional for PDF rendering.
    }

    const draw = (text: string, x: number, y: number, size = 10, weight: "regular" | "medium" = "regular") => {
      page.drawText(toPdfText(text), {
        x,
        y,
        size,
        font: weight === "medium" ? medium : regular,
        color: rgb(0.1, 0.1, 0.1),
      });
    };

    const line = (y: number) => {
      page.drawLine({
        start: { x: 40, y },
        end: { x: 555, y },
        thickness: 1,
        color: rgb(0.85, 0.85, 0.85),
      });
    };

    draw("ILLUME", 88, 786, 16, "medium");
    draw(invoiceTypeLabel, 430, 786, 14, "medium");
    draw("Premium School Uniforms", 88, 770, 10);

    draw(`Invoice # ${invoiceNumber}`, 40, 738, 10, "medium");
    draw(`Date: ${formatInvoiceDate(order.created_at)}`, 40, 722, 10);
    draw(`Order ID: ${shortOrderId}`, 40, 706, 10);

    line(690);

    draw("Bill To", 40, 670, 11, "medium");
    draw(order.customer_name || "-", 40, 652, 10);
    draw(`Phone: ${order.phone || "-"}`, 40, 636, 10);
    draw(`Alternate Phone: ${alternatePhone}`, 40, 620, 10);
    draw(`Student Name: ${studentName}`, 40, 604, 10);
    draw(`Grade: ${grade}`, 40, 588, 10);
    draw(order.address || "-", 40, 572, 10);
    draw(`${order.city || "-"} ${order.pincode || ""}`.trim(), 40, 556, 10);

    line(538);

    draw("Product", 40, 518, 10, "medium");
    draw("Size", 290, 518, 10, "medium");
    draw("Qty", 350, 518, 10, "medium");
    draw("Price", 410, 518, 10, "medium");
    draw("Subtotal", 490, 518, 10, "medium");

    let y = 498;
    for (const item of items) {
      const productName = item.products?.name || "Product";
      const size = item.product_variants?.size || "default";
      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      const rowSubtotal = qty * price;

      draw(productName, 40, y, 10);
      draw(size, 290, y, 10);
      draw(String(qty), 350, y, 10);
      draw(formatPdfCurrency(price), 410, y, 10);
      draw(formatPdfCurrency(rowSubtotal), 490, y, 10);
      y -= 18;

      if (y < 210) break;
    }

    line(y + 6);

    draw("Subtotal", 420, y - 18, 10);
    draw(formatPdfCurrency(subtotal), 490, y - 18, 10);

    draw("Shipping", 420, y - 36, 10);
    draw(formatPdfCurrency(shipping), 490, y - 36, 10);

    draw("Tax", 420, y - 54, 10);
    draw(formatPdfCurrency(tax), 490, y - 54, 10);

    line(y - 68);

    draw("TOTAL", 420, y - 88, 11, "medium");
    draw(formatPdfCurrency(total), 490, y - 88, 11, "medium");

    line(y - 102);

    draw("Thank you for choosing Illume.", 40, y - 130, 10);
    draw("hello@illume.co.in", 40, y - 146, 10);
    draw("www.illumeonline.in", 40, y - 162, 10);
    draw("(c) Illume", 40, y - 178, 10);

    const bytes = await pdfDoc.save();
    const pdfBytes = Uint8Array.from(bytes);
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeInvoiceId = invoiceNumber.replace(/[^A-Z0-9-]/gi, "");
    link.href = url;
    link.download = `Invoice_ILLUME_${safeInvoiceId}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading invoice...</div>;
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Failed to load invoice data.</p>
        <Link to="/admin/orders" className="text-xs tracking-[0.15em] uppercase underline">Back to Orders</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-card { box-shadow: none !important; border-color: #e5e7eb !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="no-print flex flex-wrap items-center gap-3">
        <Link to="/admin/orders">
          <Button variant="outline" size="sm" className="text-xs">Back to Orders</Button>
        </Link>
        <Button variant="outline" size="sm" className="text-xs" onClick={handlePrint}>Print Invoice</Button>
        <Button size="sm" className="text-xs" onClick={handleDownloadPdf}>Download PDF</Button>
      </div>

      <div className="print-card relative bg-background border border-border max-w-5xl mx-auto p-6 md:p-10 space-y-6 overflow-hidden">
        <img
          src={illumeLogo}
          alt="Illume watermark"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 opacity-[0.055] grayscale"
        />

        <header className="relative z-10 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 bg-black flex items-center justify-center rounded-sm">
              <img src={illumeLogo} alt="Illume" className="h-10 w-auto" />
            </div>
            <div>
              <h1 className="text-lg font-medium tracking-wide">ILLUME</h1>
              <p className="text-sm text-muted-foreground">Premium School Uniforms</p>
            </div>
          </div>
          <h2 className="text-lg md:text-xl font-medium tracking-[0.14em]">{invoiceTypeLabel}</h2>
        </header>

        <div className="relative z-10 text-sm space-y-1">
          <p><span className="font-medium">Invoice #</span> {invoiceNumber}</p>
          <p><span className="font-medium">Date:</span> {formatInvoiceDate(order.created_at)}</p>
          <p><span className="font-medium">Order ID:</span> {shortOrderId}</p>
        </div>

        <div className="relative z-10 border-t border-border" />

        <section className="relative z-10 text-sm space-y-1">
          <p className="font-medium">Bill To</p>
          <p>{order.customer_name || "-"}</p>
          <p>Phone: {order.phone || "-"}</p>
          <p>Alternate Phone: {alternatePhone}</p>
          <p>Student Name: {studentName}</p>
          <p>Grade: {grade}</p>
          <p>{order.address || "-"}</p>
          <p>{`${order.city || "-"} ${order.pincode || ""}`.trim()}</p>
        </section>

        <div className="relative z-10 border-t border-border" />

        <section className="relative z-10 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium">Product</th>
                <th className="text-left py-2 font-medium">Size</th>
                <th className="text-right py-2 font-medium">Qty</th>
                <th className="text-right py-2 font-medium">Price</th>
                <th className="text-right py-2 font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: InvoiceOrderItem, index: number) => {
                const qty = Number(item.quantity || 0);
                const unit = Number(item.price || 0);
                const rowTotal = qty * unit;
                return (
                  <tr key={`${item.id ?? "item"}-${index}`} className="border-b border-border/60 last:border-0">
                    <td className="py-2">{item.products?.name || "Product"}</td>
                    <td className="py-2">{item.product_variants?.size || "default"}</td>
                    <td className="py-2 text-right">{qty}</td>
                    <td className="py-2 text-right">{formatCurrency(unit)}</td>
                    <td className="py-2 text-right">{formatCurrency(rowTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <div className="relative z-10 border-t border-border" />

        <section className="relative z-10 ml-auto w-full max-w-xs text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Shipping</span>
            <span>{formatCurrency(shipping)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Tax</span>
            <span>{formatCurrency(tax)}</span>
          </div>
          <div className="border-t border-border my-2" />
          <div className="flex items-center justify-between font-medium text-base">
            <span>TOTAL</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </section>

        <div className="relative z-10 border-t border-border" />

        <footer className="relative z-10 text-sm text-muted-foreground space-y-1">
          <p>Thank you for choosing Illume.</p>
          <p>hello@illume.co.in</p>
          <p>
            <a
              href="https://www.illumeonline.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-black transition-colors"
            >
              www.illumeonline.in
            </a>
          </p>
          <p>© Illume</p>
        </footer>
      </div>
    </div>
  );
};

export default InvoicePage;
