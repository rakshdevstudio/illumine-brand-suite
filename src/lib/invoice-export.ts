import * as XLSX from 'xlsx';

export interface InvoiceExportRow {
  'Invoice Number': string;
  'Date': string;
  'Customer Name': string;
  'Phone': string;
  'Address': string;
  'Product Name': string;
  'Variant / Size': string;
  'Quantity': number;
  'Unit Price': number;
  'GST %': number;
  'CGST Amount': number;
  'SGST Amount': number;
  'Line Total': number;
  'Subtotal': number;
  'CGST Total': number;
  'SGST Total': number;
  'Grand Total': number;
}

export interface FlattenedInvoice {
  id: string;
  invoice_number: string;
  created_at: string;
  customer_name: string;
  phone: string;
  address: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
  invoice_items: Array<{
    id: string;
    product_id: string;
    variant_id: string | null;
    product_name: string;
    variant_size: string;
    quantity: number;
    unit_price: number;
    gst_percentage: number;
    cgst_amount: number;
    sgst_amount: number;
    total: number;
  }>;
}

/**
 * Flatten invoice structure into export rows
 * Each item becomes a separate row with invoice totals repeated
 */
function flattenInvoicesToRows(invoices: FlattenedInvoice[]): InvoiceExportRow[] {
  const rows: InvoiceExportRow[] = [];

  invoices.forEach((invoice) => {
    const dateStr = new Date(invoice.created_at).toLocaleDateString('en-IN');

    if (!invoice.invoice_items || invoice.invoice_items.length === 0) {
      // If no items, still add one row with invoice info
      rows.push({
        'Invoice Number': invoice.invoice_number,
        'Date': dateStr,
        'Customer Name': invoice.customer_name,
        'Phone': invoice.phone,
        'Address': invoice.address,
        'Product Name': '-',
        'Variant / Size': '-',
        'Quantity': 0,
        'Unit Price': 0,
        'GST %': 0,
        'CGST Amount': 0,
        'SGST Amount': 0,
        'Line Total': 0,
        'Subtotal': roundToTwo(invoice.subtotal),
        'CGST Total': roundToTwo(invoice.cgst),
        'SGST Total': roundToTwo(invoice.sgst),
        'Grand Total': roundToTwo(invoice.total),
      });
    } else {
      // Add one row per item
      invoice.invoice_items.forEach((item) => {
        rows.push({
          'Invoice Number': invoice.invoice_number,
          'Date': dateStr,
          'Customer Name': invoice.customer_name,
          'Phone': invoice.phone,
          'Address': invoice.address,
          'Product Name': item.product_name || 'Product',
          'Variant / Size': item.variant_size || '-',
          'Quantity': item.quantity,
          'Unit Price': roundToTwo(item.unit_price),
          'GST %': item.gst_percentage,
          'CGST Amount': roundToTwo(item.cgst_amount),
          'SGST Amount': roundToTwo(item.sgst_amount),
          'Line Total': roundToTwo(item.total),
          'Subtotal': roundToTwo(invoice.subtotal),
          'CGST Total': roundToTwo(invoice.cgst),
          'SGST Total': roundToTwo(invoice.sgst),
          'Grand Total': roundToTwo(invoice.total),
        });
      });
    }
  });

  return rows;
}

/**
 * Round to 2 decimal places
 */
function roundToTwo(value: number | null | undefined): number {
  if (!value) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Export invoices to Excel file
 */
export function exportToExcel(invoices: FlattenedInvoice[], filename: string = 'invoices.xlsx') {
  try {
    const rows = flattenInvoicesToRows(invoices);

    if (rows.length === 0) {
      throw new Error('No invoices to export');
    }

    // Create worksheet from rows
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: [
        'Invoice Number',
        'Date',
        'Customer Name',
        'Phone',
        'Address',
        'Product Name',
        'Variant / Size',
        'Quantity',
        'Unit Price',
        'GST %',
        'CGST Amount',
        'SGST Amount',
        'Line Total',
        'Subtotal',
        'CGST Total',
        'SGST Total',
        'Grand Total',
      ],
    });

    // Set column widths
    const colWidths = [
      { wch: 15 }, // Invoice Number
      { wch: 12 }, // Date
      { wch: 18 }, // Customer Name
      { wch: 12 }, // Phone
      { wch: 25 }, // Address
      { wch: 20 }, // Product Name
      { wch: 12 }, // Variant / Size
      { wch: 10 }, // Quantity
      { wch: 12 }, // Unit Price
      { wch: 8 },  // GST %
      { wch: 12 }, // CGST Amount
      { wch: 12 }, // SGST Amount
      { wch: 12 }, // Line Total
      { wch: 12 }, // Subtotal
      { wch: 12 }, // CGST Total
      { wch: 12 }, // SGST Total
      { wch: 12 }, // Grand Total
    ];
    ws['!cols'] = colWidths;

    // Create workbook and add worksheet
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');

    // Generate file
    XLSX.writeFile(wb, filename);

    return true;
  } catch (error) {
    console.error('Export to Excel failed:', error);
    throw error;
  }
}

/**
 * Export invoices to CSV
 */
export function exportToCSV(invoices: FlattenedInvoice[], filename: string = 'invoices.csv') {
  try {
    const rows = flattenInvoicesToRows(invoices);

    if (rows.length === 0) {
      throw new Error('No invoices to export');
    }

    // Convert to CSV
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);

    // Create blob and download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();

    return true;
  } catch (error) {
    console.error('Export to CSV failed:', error);
    throw error;
  }
}

/**
 * Generate filename with current date
 */
export function generateExportFilename(prefix: string = 'invoices'): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `${prefix}_${date}.xlsx`;
}

/**
 * Format invoice data for export
 * Transforms nested invoice structure into flattened format
 */
export function formatInvoiceForExport(invoice: any): FlattenedInvoice {
  return {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    created_at: invoice.created_at,
    customer_name: invoice.customer_name,
    phone: invoice.phone,
    address: invoice.address,
    subtotal: invoice.subtotal,
    cgst: invoice.cgst,
    sgst: invoice.sgst,
    total: invoice.total,
    invoice_items: (invoice.invoice_items || []).map((item: any) => ({
      id: item.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: item.product_name || item.products?.name || 'Product',
      variant_size: item.variant_size || item.product_variants?.size || '-',
      quantity: item.quantity,
      unit_price: item.unit_price,
      gst_percentage: item.gst_percentage,
      cgst_amount: item.cgst_amount,
      sgst_amount: item.sgst_amount,
      total: item.total,
    })),
  };
}
