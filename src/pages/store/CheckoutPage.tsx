import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/lib/cart";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useStudentProfile } from "@/lib/student-profile";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { deductStockAcrossBranches, fetchGlobalStockByVariants } from "@/lib/global-inventory";
import { requireSchoolId } from "@/lib/school-context";

type CheckoutForm = {
  customer_name: string;
  email: string;
  phone: string;
  alternate_phone: string;
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
    message.includes("email")
  );
};

const CheckoutPage = () => {
  const { items, total, clearCart } = useCart();
  const navigate = useNavigate();
  const studentProfile = useStudentProfile((state) => state.profile);
  const customer = useCustomerAuth((state) => state.customer);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CheckoutForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const hasItemsRef = useRef(items.length > 0);

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

    if (items.length === 0) return;

    setLoading(true);
    try {
      // ── Step 1: validate global stock (merged across all branches) ───────
      const variantIds = items.map((i) => i.variantId);
      const { stockByVariant } = await fetchGlobalStockByVariants(variantIds);
      const insufficientItems = items.filter((item) => (stockByVariant.get(item.variantId) ?? 0) < item.quantity);

      if (insufficientItems.length > 0) {
        const names = insufficientItems.map((i) => `${i.name} (Size ${i.size})`).join(", ");
        toast.error(`Insufficient stock for: ${names}. Please update your cart.`);
        setLoading(false);
        return;
      }

      // ── Step 2: create order ──────────────────────────────────────────────
      const effectiveSchoolId = requireSchoolId();

      const missingSnapshotPrices = items.filter((item) => !Number.isFinite(Number(item.price)));
      if (missingSnapshotPrices.length > 0) {
        toast.error("Some cart items are missing snapshot prices. Please refresh your cart.");
        setLoading(false);
        return;
      }

      const orderTotal = items.reduce((sum, item) => sum + Number(item.price ?? 0) * item.quantity, 0);

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
        payment_mode: "ONLINE",
        customer_id: customer?.id ?? null,
        student_name: orderPayload.studentName,
        student_class: orderPayload.grade,
        grade: orderPayload.grade,
        address: orderPayload.address,
        city: orderPayload.city,
        pincode: orderPayload.pincode,
        school_id: effectiveSchoolId,
        total_amount: orderTotal,
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
          payment_mode: "ONLINE",
          school_id: effectiveSchoolId,
          total_amount: orderTotal,
          status: "PLACED",
        },
        {
          customer_name: orderPayload.fullName,
          phone: orderPayload.phone,
          address: orderPayload.address,
          payment_mode: "ONLINE",
          school_id: effectiveSchoolId,
          total_amount: orderTotal,
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
        note: `Student Name: ${orderPayload.studentName}\nGrade: ${orderPayload.grade}\nAlternate Phone: ${orderPayload.alternatePhone || "—"}`,
      });

      // ── Step 3: insert order items ────────────────────────────────────────
      const orderItems = items.map((item) => ({
        order_id: order.id,
        product_id: item.productId,
        variant_id: item.variantId,
        quantity: item.quantity,
        price: Number(item.price ?? 0),
      }));

      const { error: itemsErr } = await supabase.from("order_items").insert(orderItems);
      if (itemsErr) throw itemsErr;

      // ── Step 4: deduct stock globally across branches ─
      for (const item of items) {
        await deductStockAcrossBranches(item.variantId, item.productId, item.quantity, order.id);
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
