# ILLUME — Luxury School Uniform Ecommerce Platform (Phase 1)

## Design System

- Pure white luxury theme inspired by Apple/Saint Laurent/COS
- Colors: White (#FFFFFF), Black (#000000), Secondary (#555555), Borders (#EAEAEA)
- Inter font throughout, elegant thin headings, maximum whitespace
- Subtle hover animations, no gradients, no shadows, editorial fashion feel

## Parent Ecommerce Store

### `/store` — Homepage

- Centered ILLUME logo, minimal hero text
- School selection grid (Delhi Public School, St Mary School, National Public School) with clean white cards, thin borders, subtle hover

### `/store/school/:id` — Product Listing

- Clean product grid for selected school
- Large product cards with image, name, price, elegant hover effects

### `/store/product/:id` — Product Detail

- 2-column layout: large image + thumbnails on left; name, price, size selector, Add to Cart, description, shipping info on right

### `/store/cart` — Cart

- Items list with quantity selector, total price, checkout button

### `/store/checkout` — Checkout

- Parent name, phone, address fields, Place Order button

### `/store/confirmation` — Order Confirmation

- Success message with Order ID

## Admin Dashboard

### `/admin/dashboard`

- KPI cards (Total Products, Total Orders, Low Stock Items)
- Recent orders table, low stock alerts
- Minimal sidebar with ILLUME logo

### `/admin/inventory`

- Product table: Name, School, Category, Size, Stock, Price, Status
- Add/Edit product, adjust stock quantity

### `/admin/orders`

- Orders table: ID, Customer, Product, Quantity, Total, Status, Date
- Order detail view

## Supabase Backend

### Database Tables

- **products**: id, name, school, category, size, price, stock, image_url, description, status
- **orders**: id, customer_name, phone, address, total_amount, status, created_at
- **order_items**: id, order_id, product_id, quantity, price
- **inventory_logs**: id, product_id, change_type, quantity_change, previous_stock, new_stock, order_id, created_at

### Inventory Sync Logic

- On order placement: reduce stock in products table, create inventory_log entry
- Admin dashboard and inventory page reflect real-time stock levels
- Low stock alerts when stock falls below threshold

### Seed Data

- DPS Shirt Size 30 (₹1,200, stock 120), DPS Pant Size 32 (₹1,400, stock 80), St Mary Shirt Size 28 (₹1,100, stock 60), and more across all schools

## Navigation

- Admin sidebar: Dashboard, Inventory, Orders, Store link
- Store: minimal top nav with ILLUME logo  

  &nbsp;
  ## **1. Add** 
  ## **schools**
  ##  **table (CRITICAL)**
  &nbsp;
  &nbsp;
  Right now, schools are hardcoded. That’s not scalable.
  &nbsp;
  Add this:### schools
  - id
  - name
  - slug
  - logo_url
  - created_at
- Why this matters:
  &nbsp;
  • Allows admin to add new schools
  • Makes system scalable
  • Prevents redesign later
  &nbsp;
  ---
  &nbsp;
  &nbsp;
  ## **2. Add product variants support (IMPORTANT)**
  &nbsp;
  &nbsp;
  Uniforms always have sizes. Don’t store size as plain text.
  &nbsp;
  Update products structure to:
- products:
  - id
  - name
  - school_id
  - category
  - price
  - image_url
  - description
  - created_at
  product_variants:
  - id
  - product_id
  - size
  - stock
  - sku

This makes stock management correct.

&nbsp;

## **3. Add proper order status system**

&nbsp;

Update orders table:

orders:

- id

- customer_name

- phone

- address

- total_amount

- status (pending, confirmed, delivered)

- created_at

&nbsp;

&nbsp;

# **✅ Final corrected database structure (recommended)**

&nbsp;

&nbsp;

Your Phase 1 tables should be:

schools

products

product_variants

orders

order_items

inventory_logs

&nbsp;

# **Everything else in your spec is PERFECT**

&nbsp;

&nbsp;

Your:

&nbsp;

• UI/UX design system

• Page structure

• Admin panel layout

• Inventory sync logic

• Ecommerce flow

&nbsp;

All are correct and professional.

&nbsp;

You are ready to build.