# Illume ERP Architecture (BUSY Replacement)

## API Contracts (RPC over Supabase)

### `create_order(payload jsonb) -> jsonb`
Request payload:
- `customer_name` string (required)
- `phone` string (required)
- `address` string (required)
- `school_id` uuid (optional)
- `branch_id` uuid (optional)
- `items[]` required:
  - `product_id` uuid
  - `variant_id` uuid
  - `quantity` integer > 0
  - `unit_price` numeric >= 0

Response:
- `order_id` uuid
- `total_amount` numeric
- `status` string

### `create_invoice(order_id uuid) -> jsonb`
Response:
- `invoice_id` uuid
- `ledger_entry_id` uuid

### `adjust_inventory(branch_id, variant_id, quantity, reason, reference_id) -> jsonb`
Response:
- `movement_id` uuid
- `before_stock` integer
- `after_stock` integer
- `delta` integer

### `create_purchase(payload jsonb) -> jsonb`
Request payload:
- `vendor_id` uuid
- `branch_id` uuid (optional)
- `purchase_date` date (optional)
- `due_date` date (optional)
- `notes` text (optional)
- `items[]` required:
  - `product_id` uuid
  - `variant_id` uuid
  - `quantity` integer > 0
  - `unit_cost` numeric >= 0
  - `gst_percentage` numeric >= 0

Response:
- `purchase_id` uuid
- `purchase_number` text
- `ledger_entry_id` uuid
- `total` numeric

### `fetch_customer_by_phone(phone text) -> jsonb`
Response:
- customer identity + students array (via checkout CRM lookup function)

## Accounting Rules

- Invoice posting (double-entry):
  - Dr `1200 Accounts Receivable`: invoice total
  - Cr `3100 Sales Revenue`: subtotal
  - Cr `2100 Output GST Payable`: CGST + SGST
- Purchase posting (double-entry):
  - Dr `1000 Inventory Asset`: subtotal
  - Dr `1210 Input CGST`
  - Dr `1211 Input SGST`
  - Cr `2200 Accounts Payable`: purchase total
- Ledger lines are balanced by function-level validation (`debit == credit`).

## Data Flow

1. Store checkout calls `create_order`.
2. `create_order` inserts order + items and auto-adjusts stock (`OUT`) for branch-aware flows.
3. Invoice generation via `create_invoice` / existing auto-invoice trigger.
4. `post_ledger_for_invoice` writes accounting entry.
5. Purchase intake via `create_purchase`:
   - purchase + items
   - stock increase (`IN`)
   - accounting posting
6. Reports read from materialized business views:
   - `v_sales_gst_summary`
   - `v_purchase_gst_summary`
   - `v_customer_outstanding`

## Security Model

- RLS enabled on all ERP core tables.
- Backoffice policies depend on `is_backoffice_user()` and authenticated role membership.
- Public/anonymous access is limited to explicitly granted safe RPCs (`create_order`, `fetch_customer_by_phone`).
- Mutating APIs use `SECURITY DEFINER` and validate payload shape before writes.

## Scalability Notes

- Search indexes:
  - normalized customer phone
  - trigram search on customer/student/vendor names
- Operational indexes:
  - invoice number lookup
  - purchase by vendor/date and status/date
  - ledger source references
  - invoice payment by invoice/date
- Transactions remain atomic in RPC scope, preventing partial writes (order/purchase/ledger consistency).

## Frontend Admin Modules Added

- `Vendors` page (`/admin/vendors`): search, pagination, CSV export.
- `Purchases` page (`/admin/purchases`): search, status filter, pagination, CSV export.
- `GST Report` (`/admin/reports/gst`): date filters, summary cards, CSV export.
- `Customer Insights` (`/admin/reports/customers`): outstanding analysis, search, pagination, CSV export.

## Edge Cases Covered

- Invalid payload shape and empty item arrays rejected.
- Zero/negative quantity validation on order and purchase items.
- Inventory movement rejects impossible stock transitions.
- Ledger posting rejects unbalanced entries.
- Duplicate invoice/purchase numbering prevented by advisory-lock sequence strategy.
