import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/lib/cart";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useStudentProfile } from "@/lib/student-profile";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useStoreActiveBranch } from "@/hooks/use-store-active-branch";

type CheckoutForm = {
  customer_name: string;
  email: string;
  phone: string;
  alternate_phone: string;
  gst_number: string;
  student_name: string;
  grade: string;
  address: string;
  city: string;
  pincode: string;
};

const EMPTY_FORM: CheckoutForm = {
  customer_name: "",
  email: "",
  phone: "",
  alternate_phone: "",
  gst_number: "",
  student_name: "",
  grade: "",
  address: "",
  city: "",
  pincode: "",
};

type CheckoutErrors = Partial<Record<keyof CheckoutForm, string>>;

const isMissingOrderColumnError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    message.includes("student_class") ||
    message.includes("student_name") ||
    message.includes("alternate_phone") ||
    message.includes("grade") ||
    message.includes("city") ||
    message.includes("pincode") ||
    message.includes("customer_id") ||
    message.includes("email") ||
    message.includes("gst_number") ||
    message.includes("is_gst_order")
  );
};

const isMissingBranchInfraError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    message.includes("branch_inventory") ||
    message.includes("branch_id") ||
    message.includes("assigned_at")
  );
};

const CheckoutPage = () => {
  const { items, total, clearCart } = useCart();
  const navigate = useNavigate();
  const studentProfile = useStudentProfile((state) => state.profile);
  const customer = useCustomerAuth((state) => state.customer);
  const { activeBranchId } = useStoreActiveBranch();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CheckoutForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [hasGstNumber, setHasGstNumber] = useState(false);
  const hasItemsRef = useRef(items.length > 0);

  const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

  const set = (field: keyof CheckoutForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => {
      const next = { ...f, [field]: e.target.value };
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
      return next;
    });

  const getInputClass = (field: keyof CheckoutForm) =>
    `h-12 border ${errors[field] ? "border-destructive" : "border-border"} transition-[border-color,box-shadow] duration-200`;

  const getTextareaClass = (field: keyof CheckoutForm) =>
    `w-full min-h-[80px] border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none transition-[border-color,box-shadow] duration-200 ${errors[field] ? "border-destructive" : "border-border"}`;

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: CheckoutErrors = {};

    if (!form.customer_name.trim()) nextErrors.customer_name = "Full name is required";
    if (!form.email.trim()) nextErrors.email = "Email is required";
    if (!form.phone.trim()) nextErrors.phone = "Phone number is required";
    if (!form.student_name.trim()) nextErrors.student_name = "Student name is required";
    if (!form.grade.trim()) nextErrors.grade = "Grade / Class is required";
    if (!form.address.trim()) nextErrors.address = "Delivery address is required";
    if (!form.city.trim()) nextErrors.city = "City is required";
    if (!form.pincode.trim()) nextErrors.pincode = "Pincode is required";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error("Please fill all required fields");
      return;
    }

    setErrors({});

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
    if (!emailValid) {
      setErrors((prev) => ({ ...prev, email: "Please enter a valid email address" }));
      toast.error("Please enter a valid email address");
      return;
    }

    const phoneDigits = form.phone.replace(/\D/g, "");
    if (!/^\d{10}$/.test(phoneDigits)) {
      setErrors((prev) => ({ ...prev, phone: "Phone number must be 10 digits" }));
      toast.error("Phone number must be 10 digits");
      return;
    }

    const alternatePhoneDigits = form.alternate_phone.replace(/\D/g, "");
    if (alternatePhoneDigits && !/^\d{10}$/.test(alternatePhoneDigits)) {
      setErrors((prev) => ({ ...prev, alternate_phone: "Alternate phone must be 10 digits" }));
      toast.error("Alternate phone number must be 10 digits");
      return;
    }

    const pincodeDigits = form.pincode.replace(/\D/g, "");
    if (!/^\d{6}$/.test(pincodeDigits)) {
      setErrors((prev) => ({ ...prev, pincode: "Pincode must be 6 digits" }));
      toast.error("Pincode must be 6 digits");
      return;
    }

    const normalizedGst = form.gst_number.trim().toUpperCase().replace(/\s+/g, "");
    if (hasGstNumber) {
      if (!normalizedGst) {
        setErrors((prev) => ({ ...prev, gst_number: "GST number is required" }));
        toast.error("GST number is required");
        return;
      }

      if (!GST_REGEX.test(normalizedGst)) {
        setErrors((prev) => ({ ...prev, gst_number: "Enter a valid GST number" }));
        toast.error("Enter a valid GST number");
        return;
      }
    }

    if (items.length === 0) return;

    setLoading(true);
    try {
      // ── Step 1: validate stock from active branch inventory ───────
      const variantIds = items.map((i) => i.variantId);
      let assignedBranchId: string | null = activeBranchId ?? null;
      let selectedBranchRows: Array<{ branch_id: string; variant_id: string; stock: number }> = [];

      if (!assignedBranchId) {
        toast.error("Select a branch before checkout");
        return;
      }

      const branchInventoryAttempt = await (supabase as any)
        .from("branch_inventory")
        .select("branch_id, variant_id, stock")
        .eq("branch_id", assignedBranchId)
        .in("variant_id", variantIds);

      if (branchInventoryAttempt.error) {
        if (!isMissingBranchInfraError(branchInventoryAttempt.error)) {
          throw branchInventoryAttempt.error;
        }
        toast.error("Branch inventory is not configured yet");
        return;
      }

      selectedBranchRows = (branchInventoryAttempt.data ?? []).map((row: any) => ({
        branch_id: row.branch_id,
        variant_id: row.variant_id,
        stock: Number(row.stock ?? 0),
      }));

      const stockByVariant = new Map(selectedBranchRows.map((row) => [row.variant_id, row.stock]));
      const insufficientItems = items.filter((item) => (stockByVariant.get(item.variantId) ?? 0) < item.quantity);

      if (insufficientItems.length > 0) {
        const names = insufficientItems.map((i) => `${i.name} (Size ${i.size})`).join(", ");
        toast.error(`Insufficient stock for: ${names}. Please update your cart.`);
        return;
      }

      // ── Step 2: create order ──────────────────────────────────────────────
      const productIds = Array.from(new Set(items.map((item) => item.productId)));
      const { data: productSchools } = await supabase
        .from("products")
        .select("id, school_id")
        .in("id", productIds);

      const resolvedSchoolIds = Array.from(
        new Set((productSchools ?? []).map((row) => row.school_id).filter(Boolean))
      ) as string[];

      const fallbackSchoolId = resolvedSchoolIds.length === 1 ? resolvedSchoolIds[0] : null;
      const effectiveSchoolId = studentProfile?.schoolId ?? customer?.child_school_id ?? fallbackSchoolId ?? null;

      const orderPayload = {
        fullName: form.customer_name,
        email: form.email,
        phone: form.phone,
        alternatePhone: form.alternate_phone,
        studentName: form.student_name,
        grade: form.grade,
        address: form.address,
        city: form.city,
        pincode: form.pincode,
      };

      const legacyOrderPayload = {
        customer_name: orderPayload.fullName,
        email: orderPayload.email,
        phone: orderPayload.phone,
        alternate_phone: orderPayload.alternatePhone || null,
        gst_number: hasGstNumber ? normalizedGst : null,
        is_gst_order: hasGstNumber,
        customer_id: customer?.id ?? null,
        student_name: orderPayload.studentName,
        student_class: orderPayload.grade,
        grade: orderPayload.grade,
        address: orderPayload.address,
        city: orderPayload.city,
        pincode: orderPayload.pincode,
        school_id: effectiveSchoolId,
        branch_id: assignedBranchId,
        total_amount: total(),
        status: "PLACED",
      };

      const payloadVariants = [
        legacyOrderPayload,
        (() => {
          const { student_class: _studentClass, ...compatPayload } = legacyOrderPayload;
          return compatPayload;
        })(),
        {
          customer_name: orderPayload.fullName,
          phone: orderPayload.phone,
          address: orderPayload.address,
          gst_number: hasGstNumber ? normalizedGst : null,
          is_gst_order: hasGstNumber,
          school_id: effectiveSchoolId,
          branch_id: assignedBranchId,
          total_amount: total(),
          status: "PLACED",
        },
        (() => {
          const { gst_number: _gstNumber, is_gst_order: _isGstOrder, ...legacyWithoutGst } = legacyOrderPayload;
          return legacyWithoutGst;
        })(),
        (() => {
          const { student_class: _studentClass, gst_number: _gstNumber, is_gst_order: _isGstOrder, ...compatWithoutGst } = legacyOrderPayload;
          return compatWithoutGst;
        })(),
        {
          customer_name: orderPayload.fullName,
          phone: orderPayload.phone,
          address: orderPayload.address,
          school_id: effectiveSchoolId,
          branch_id: assignedBranchId,
          total_amount: total(),
          status: "PLACED",
        },
      ];

      let order: any = null;
      let orderErr: any = null;

      for (const [index, payloadVariant] of payloadVariants.entries()) {
        const attempt = await (supabase as any)
          .from("orders")
          .insert(payloadVariant)
          .select()
          .single();

        order = attempt.data;
        orderErr = attempt.error;

        if (!orderErr) {
          break;
        }

        if (!isMissingOrderColumnError(orderErr) || index === payloadVariants.length - 1) {
          break;
        }

        console.warn("orders schema is older than the checkout payload, retrying with a compatible insert shape.");
      }

      if (orderErr) throw orderErr;
      if (!order) throw new Error("Order was not created");

      await supabase.from("order_notes").insert({
        order_id: order.id,
        note: `Student Name: ${orderPayload.studentName}\nGrade: ${orderPayload.grade}\nAlternate Phone: ${orderPayload.alternatePhone || "—"}${hasGstNumber ? `\nGSTIN: ${normalizedGst}` : ""}${assignedBranchId ? "\nBranch Assignment: Auto-assigned" : "\nBranch Assignment: Manual required"}`,
      });

      // ── Step 3: insert order items ────────────────────────────────────────
      const orderItems = items.map((item) => ({
        order_id: order.id,
        product_id: item.productId,
        variant_id: item.variantId,
        quantity: item.quantity,
        price: item.price,
      }));

      const { error: itemsErr } = await supabase.from("order_items").insert(orderItems);
      if (itemsErr) throw itemsErr;

      // ── Step 4: deduct stock from assigned branch only ─
      for (const item of items) {
        const snapshot = selectedBranchRows.find((row) => row.variant_id === item.variantId);
        const previous = Number(snapshot?.stock ?? 0);

        const { data: movementData, error: branchUpdateError } = await (supabase as any).rpc("apply_inventory_movement", {
          p_branch_id: assignedBranchId,
          p_variant_id: item.variantId,
          p_type: "OUT",
          p_quantity: item.quantity,
          p_reference_type: "ORDER",
          p_reference_id: order.id,
          p_reason: "Checkout order deduction",
        });

        if (branchUpdateError) throw branchUpdateError;

        const updatedStock = Number(movementData?.after_stock ?? Math.max(0, previous - item.quantity));
        const beforeStock = Number(movementData?.before_stock ?? previous);

        await supabase.from("inventory_logs").insert({
          product_id: item.productId,
          variant_id: item.variantId,
          change_type: "order",
          quantity_change: -item.quantity,
          previous_stock: beforeStock,
          new_stock: updatedStock,
          order_id: order.id,
        });
      }

      clearCart();

      // Fire-and-forget order confirmation email
      if (import.meta.env.PROD) {
        supabase.functions
          .invoke("send-order-confirmation", {
            body: {
              email: form.email,
              name: form.customer_name,
              orderId: order.id,
              items: items.map((item) => ({
                name: item.name,
                size: item.size,
                quantity: item.quantity,
                price: item.price,
              })),
              total: order.total_amount,
            },
          })
          .catch(() => undefined);
      }

      navigate(`/store/confirmation?order=${order.id}`, { replace: true });
    } catch (err) {
      console.error(err);
      toast.error("Failed to place order. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!hasItemsRef.current) {
    navigate("/store/cart", { replace: true });
    return null;
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <h1 className="text-2xl font-extralight tracking-[0.1em] uppercase mb-12">
        Checkout
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Full Name */}
        <div>
          <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Full Name <span className="text-destructive">*</span>
          </label>
          <Input
            value={form.customer_name}
            onChange={set("customer_name")}
            className={getInputClass("customer_name")}
            placeholder="Enter your full name"
            autoComplete="name"
          />
          {errors.customer_name && <p className="mt-2 text-xs text-destructive">{errors.customer_name}</p>}
        </div>

        {/* Email */}
        <div>
          <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Email <span className="text-destructive">*</span>
          </label>
          <Input
            type="email"
            value={form.email}
            onChange={set("email")}
            className={getInputClass("email")}
            placeholder="you@example.com"
            autoComplete="email"
          />
          {errors.email && <p className="mt-2 text-xs text-destructive">{errors.email}</p>}
        </div>

        {/* Phone */}
        <div>
          <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Phone Number <span className="text-destructive">*</span>
          </label>
          <Input
            type="tel"
            value={form.phone}
            onChange={set("phone")}
            className={getInputClass("phone")}
            placeholder="+91 98765 43210"
            autoComplete="tel"
          />
          {errors.phone && <p className="mt-2 text-xs text-destructive">{errors.phone}</p>}
        </div>

        {/* Alternate Phone */}
        <div>
          <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Alternate Phone Number (Optional)
          </label>
          <Input
            type="tel"
            value={form.alternate_phone}
            onChange={set("alternate_phone")}
            className={getInputClass("alternate_phone")}
            placeholder="+91 XXXXX XXXXX"
            autoComplete="tel"
          />
          {errors.alternate_phone && <p className="mt-2 text-xs text-destructive">{errors.alternate_phone}</p>}
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs tracking-[0.12em] text-muted-foreground uppercase">
            <input
              type="checkbox"
              checked={hasGstNumber}
              onChange={(e) => {
                const checked = e.target.checked;
                setHasGstNumber(checked);
                if (!checked) {
                  setForm((prev) => ({ ...prev, gst_number: "" }));
                  setErrors((prev) => ({ ...prev, gst_number: undefined }));
                }
              }}
              className="h-4 w-4"
            />
            I have GST number
          </label>

          {hasGstNumber && (
            <div>
              <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
                GST Number <span className="text-destructive">*</span>
              </label>
              <Input
                value={form.gst_number}
                onChange={(e) => {
                  const nextValue = e.target.value.toUpperCase();
                  setForm((prev) => ({ ...prev, gst_number: nextValue }));
                  if (errors.gst_number) {
                    setErrors((prev) => ({ ...prev, gst_number: undefined }));
                  }
                }}
                className={getInputClass("gst_number")}
                placeholder="27ABCDE1234F1Z5"
                autoComplete="off"
                maxLength={15}
              />
              {errors.gst_number && <p className="mt-2 text-xs text-destructive">{errors.gst_number}</p>}
            </div>
          )}
        </div>

        {/* Student Name */}
        <div>
          <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Student Name <span className="text-destructive">*</span>
          </label>
          <Input
            value={form.student_name}
            onChange={set("student_name")}
            className={getInputClass("student_name")}
            placeholder="Enter student name"
            autoComplete="off"
          />
          {errors.student_name && <p className="mt-2 text-xs text-destructive">{errors.student_name}</p>}
        </div>

        {/* Grade / Class */}
        <div>
          <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Grade / Class <span className="text-destructive">*</span>
          </label>
          <Input
            value={form.grade}
            onChange={set("grade")}
            className={getInputClass("grade")}
            placeholder="e.g. Class 10, Nursery, Grade 5"
            autoComplete="off"
          />
          {errors.grade && <p className="mt-2 text-xs text-destructive">{errors.grade}</p>}
        </div>

        {/* Address */}
        <div>
          <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Delivery Address <span className="text-destructive">*</span>
          </label>
          <textarea
            value={form.address}
            onChange={set("address")}
            className={getTextareaClass("address")}
            placeholder="House / flat / street"
            autoComplete="street-address"
          />
          {errors.address && <p className="mt-2 text-xs text-destructive">{errors.address}</p>}
        </div>

        {/* City + Pincode side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
              City <span className="text-destructive">*</span>
            </label>
            <Input
              value={form.city}
              onChange={set("city")}
              className={getInputClass("city")}
              placeholder="City"
              autoComplete="address-level2"
            />
            {errors.city && <p className="mt-2 text-xs text-destructive">{errors.city}</p>}
          </div>
          <div>
            <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
              Pincode <span className="text-destructive">*</span>
            </label>
            <Input
              value={form.pincode}
              onChange={set("pincode")}
              className={getInputClass("pincode")}
              placeholder="6-digit pincode"
              inputMode="numeric"
              maxLength={6}
              autoComplete="postal-code"
            />
            {errors.pincode && <p className="mt-2 text-xs text-destructive">{errors.pincode}</p>}
          </div>
        </div>

        <div className="pt-6 border-t border-border">
          <div className="flex justify-between items-center mb-6">
            <span className="text-xs tracking-[0.2em] uppercase">Total</span>
            <span className="text-lg font-light">{formatPrice(total())}</span>
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 text-xs tracking-[0.2em] uppercase"
          >
            {loading ? "Placing Order..." : "Place Order"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CheckoutPage;
