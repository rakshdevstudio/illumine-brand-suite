import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/lib/cart";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useStudentProfile } from "@/lib/student-profile";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { deductStockAcrossBranches, fetchGlobalStockByVariants } from "@/lib/global-inventory";
import { requireSchoolId } from "@/lib/school-context";
import { getSafeErrorMessage, logger } from "@/lib/logger";

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

type CheckoutLookupStudent = {
  id: string;
  name: string;
  class_name: string;
  gender: "Male" | "Female" | "Unisex";
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

const isStorefrontWriteAccessError = (error: {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
  status?: number;
} | null) => {
  if (!error) return false;

  const combinedMessage = [error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();

  return (
    error.status === 401 ||
    error.code === "42501" ||
    combinedMessage.includes("permission denied") ||
    combinedMessage.includes("row-level security") ||
    combinedMessage.includes("violates row-level security") ||
    combinedMessage.includes("jwt") ||
    combinedMessage.includes("not authenticated")
  );
};

const getCheckoutFailureMessage = (error: unknown) => {
  if (isStorefrontWriteAccessError(error as { code?: string; message?: string; status?: number } | null)) {
    return import.meta.env.DEV
      ? "Checkout is blocked by Supabase order permissions. Apply the latest migrations, then try again."
      : "Checkout is temporarily unavailable. Please try again shortly.";
  }

  return getSafeErrorMessage(error, "Failed to place order. Please try again.");
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const isInvoiceCreationRaceError = (error: unknown) => {
  const message = getSafeErrorMessage(error, "");
  return (
    message.includes("Invoice total must match order total") ||
    message.includes("Order not fully inserted yet")
  );
};

const getPersistedOrderItemsSnapshot = async (orderId: string) => {
  const { data, error } = await supabase
    .from("order_items")
    .select("quantity, price")
    .eq("order_id", orderId);

  if (error) throw error;

  const rows = data ?? [];
  const total = rows.reduce(
    (sum, item) => sum + Number(item.price ?? 0) * Number(item.quantity ?? 0),
    0,
  );

  return {
    count: rows.length,
    total,
  };
};

const waitForPersistedOrderItems = async (orderId: string, expectedTotal: number, expectedCount: number) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const snapshot = await getPersistedOrderItemsSnapshot(orderId);
    if (
      snapshot.count >= expectedCount &&
      Math.abs(snapshot.total - expectedTotal) <= 0.01
    ) {
      return snapshot;
    }

    await sleep(250);
  }

  const finalSnapshot = await getPersistedOrderItemsSnapshot(orderId);
  throw new Error(
    `Order items not fully persisted before invoice creation. order_total=${expectedTotal.toFixed(2)}, items_total=${finalSnapshot.total.toFixed(2)}, item_count=${finalSnapshot.count}`,
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
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupStudents, setLookupStudents] = useState<CheckoutLookupStudent[]>([]);
  const [lookupCustomerId, setLookupCustomerId] = useState<string | null>(null);
  const [usingExistingStudent, setUsingExistingStudent] = useState(false);
  const [autoFillPulse, setAutoFillPulse] = useState(false);
  const hasItemsRef = useRef(items.length > 0);
  const autoFillTimeoutRef = useRef<number | null>(null);

  const schoolId = studentProfile?.schoolId ?? null;

  const { data: classes } = useQuery({
    queryKey: ["checkout-classes", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name")
        .eq("school_id", schoolId!)
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!schoolId || !studentProfile) return;
    setForm((prev) => ({
      ...prev,
      grade: prev.grade || studentProfile.className,
      student_name: prev.student_name || "",
    }));
  }, [schoolId, studentProfile]);

  useEffect(() => {
    return () => {
      if (autoFillTimeoutRef.current) {
        window.clearTimeout(autoFillTimeoutRef.current);
      }
    };
  }, []);

  const pulseAutoFill = () => {
    setAutoFillPulse(true);
    if (autoFillTimeoutRef.current) {
      window.clearTimeout(autoFillTimeoutRef.current);
    }
    autoFillTimeoutRef.current = window.setTimeout(() => {
      setAutoFillPulse(false);
      autoFillTimeoutRef.current = null;
    }, 800);
  };

  useEffect(() => {
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      setLookupStudents([]);
      setLookupCustomerId(null);
      setUsingExistingStudent(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLookupLoading(true);
      try {
        const { data, error } = await (supabase as any).rpc("find_checkout_customer_by_phone", {
          p_phone: phoneDigits,
        });

        if (error) throw error;
        if (!data) {
          setLookupStudents([]);
          setLookupCustomerId(null);
          setUsingExistingStudent(false);
          return;
        }

        const students = (data.students ?? [])
          .map((student: any) => ({
            id: String(student.id),
            name: String(student.name || ""),
            class_name: String(student.class_name || ""),
            gender: (String(student.gender || "Unisex") as "Male" | "Female" | "Unisex"),
          }))
          .filter((student: CheckoutLookupStudent) => student.name);

        setLookupCustomerId(data.customer_id ?? null);
        setLookupStudents(students);

        setForm((prev) => ({
          ...prev,
          customer_name: prev.customer_name || data.name || "",
          email: prev.email || data.email || "",
        }));

        pulseAutoFill();

        if (students.length > 0) {
          const first = students[0];
          setUsingExistingStudent(true);
          setForm((prev) => ({
            ...prev,
            student_name: prev.student_name || first.name,
            grade: prev.grade || first.class_name,
          }));
        } else {
          setUsingExistingStudent(false);
        }
      } catch (lookupError) {
        logger.warn("Checkout customer lookup failed", lookupError);
      } finally {
        setLookupLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [form.phone]);

  const set = (field: keyof CheckoutForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => {
      const next = { ...f, [field]: e.target.value };
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
      return next;
    });

  const getInputClass = (field: keyof CheckoutForm) =>
    `h-12 border ${errors[field] ? "border-destructive" : "border-border"} ${
      autoFillPulse && ["customer_name", "email", "student_name", "grade"].includes(field)
        ? "border-emerald-200 bg-emerald-50/40"
        : ""
    } transition-[border-color,box-shadow,background-color,opacity] duration-300`;

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
        student_name: orderPayload.studentName,
        student_class: orderPayload.grade,
        grade: orderPayload.grade,
        address: orderPayload.address,
        city: orderPayload.city,
        pincode: orderPayload.pincode,
        school_id: effectiveSchoolId,
        total_amount: 0,
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
          total_amount: 0,
          status: "PLACED",
        },
        {
          customer_name: orderPayload.fullName,
          phone: orderPayload.phone,
          address: orderPayload.address,
          payment_mode: "ONLINE",
          school_id: effectiveSchoolId,
          total_amount: 0,
          status: "PLACED",
        },
      ];

      const createdOrderId = crypto.randomUUID();
      let order: any = null;
      let orderErr: any = null;

      for (const [index, payloadVariant] of payloadVariants.entries()) {
        const attempt = await (supabase as any)
          .from("orders")
          .insert({
            id: createdOrderId,
            ...payloadVariant,
          });

        order = { id: createdOrderId, total_amount: 0 };
        orderErr = attempt.error;

        if (!orderErr) {
          break;
        }

        if (!isMissingOrderColumnError(orderErr) || index === payloadVariants.length - 1) {
          break;
        }

        logger.warn("Orders schema is older than the checkout payload; retrying with a compatible insert shape.");
      }

      if (orderErr) throw orderErr;
      if (!order) throw new Error("Order was not created");

      await supabase.from("order_notes").insert({
        order_id: order.id,
        note: `Student Name: ${orderPayload.studentName}\nGrade: ${orderPayload.grade}\nAlternate Phone: ${orderPayload.alternatePhone || "—"}`,
      });

      // ── Step 3: insert order items sequentially with running total sync ───
      // Invoice creation is trigger-driven on order_items insert; keeping order total
      // aligned with inserted subtotal avoids trigger-order race conditions.
      let runningOrderTotal = 0;
      for (const item of items) {
        const lineTotal = Number(item.price ?? 0) * item.quantity;
        const nextRunningTotal = runningOrderTotal + lineTotal;

        const { error: preSyncErr } = await supabase
          .from("orders")
          .update({ total_amount: nextRunningTotal })
          .eq("id", order.id);
        if (preSyncErr) throw preSyncErr;

        const { error: itemErr } = await supabase.from("order_items").insert({
          order_id: order.id,
          product_id: item.productId,
          variant_id: item.variantId,
          quantity: item.quantity,
          price: Number(item.price ?? 0),
        });
        if (itemErr) throw itemErr;

        runningOrderTotal = nextRunningTotal;
      }

      if (Math.abs(orderTotal - runningOrderTotal) > 0.001) {
        const { error: syncOrderTotalErr } = await supabase
          .from("orders")
          .update({ total_amount: orderTotal })
          .eq("id", order.id);

        if (syncOrderTotalErr) {
          logger.warn("Unable to sync final order total after item inserts; continuing checkout flow.", syncOrderTotalErr);
        }
      }

      order.total_amount = orderTotal;

      await waitForPersistedOrderItems(order.id, orderTotal, items.length);

      const { data: checkoutLinkResult, error: crmLinkError } = await (supabase as any).rpc("attach_checkout_entities_to_order", {
        p_order_id: order.id,
        p_customer_name: orderPayload.fullName,
        p_customer_phone: phoneDigits,
        p_customer_email: orderPayload.email,
        p_student_name: orderPayload.studentName,
        p_school_id: effectiveSchoolId,
        p_class_name: orderPayload.grade,
        p_gender:
          studentProfile?.gender === "boys"
            ? "Male"
            : studentProfile?.gender === "girls"
              ? "Female"
              : "Unisex",
        p_alternate_phone: orderPayload.alternatePhone || null,
      });

      if (crmLinkError) throw crmLinkError;

      const attachedInvoiceId =
        Array.isArray(checkoutLinkResult) && checkoutLinkResult.length > 0
          ? checkoutLinkResult[0]?.out_invoice_id ?? null
          : null;

      let invoiceId = attachedInvoiceId;

      if (!invoiceId) {
        let lastInvoiceError: unknown = null;

        for (let attempt = 0; attempt < 3 && !invoiceId; attempt += 1) {
          try {
            await waitForPersistedOrderItems(order.id, orderTotal, items.length);

            const { data: createdInvoiceId, error: invoiceError } = await (supabase as any).rpc("create_invoice_from_order", {
              p_order_id: order.id,
            });

            if (invoiceError) throw invoiceError;
            invoiceId = createdInvoiceId;
          } catch (invoiceAttemptError) {
            lastInvoiceError = invoiceAttemptError;

            if (!isInvoiceCreationRaceError(invoiceAttemptError) || attempt === 2) {
              throw invoiceAttemptError;
            }

            logger.warn("Invoice creation raced order item persistence; retrying after a short wait.", invoiceAttemptError);
            await sleep(400);
          }
        }

        if (!invoiceId && lastInvoiceError) {
          throw lastInvoiceError;
        }
      }

      if (!invoiceId) {
        throw new Error("Invoice was not created for the completed order.");
      }

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
      logger.error("Failed to place order", err);
      toast.error(getCheckoutFailureMessage(err));
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

      <p className="-mt-8 mb-8 text-sm text-muted-foreground/80">
        Already ordered before? Enter your phone number for a faster checkout.
      </p>

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
            placeholder="+91 9972721666"
            autoComplete="tel"
          />
          {errors.phone && <p className="mt-2 text-xs text-destructive">{errors.phone}</p>}
          {lookupLoading && (
            <p className="mt-2 text-xs text-muted-foreground/85 animate-pulse transition-opacity duration-300">
              Fetching your details...
            </p>
          )}
          {!lookupLoading && lookupCustomerId && (
            <p className="mt-2 text-xs text-emerald-600 transition-opacity duration-300">
              ✓ Welcome back, {form.customer_name || "there"} - details auto-filled
            </p>
          )}
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
          {lookupStudents.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] tracking-[0.12em] uppercase text-muted-foreground">Saved Students</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-[10px] uppercase tracking-[0.14em]"
                  onClick={() => setUsingExistingStudent((prev) => !prev)}
                >
                  {usingExistingStudent ? "Add New Student" : "Use Existing"}
                </Button>
              </div>
              {usingExistingStudent && (
                <Select
                  value={`${form.student_name}__${form.grade}`}
                  onValueChange={(value) => {
                    const found = lookupStudents.find((student) => `${student.name}__${student.class_name}` === value);
                    if (!found) return;
                    setForm((prev) => ({
                      ...prev,
                      student_name: found.name,
                      grade: found.class_name,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select existing student" />
                  </SelectTrigger>
                  <SelectContent>
                    {lookupStudents.map((student) => (
                      <SelectItem key={student.id} value={`${student.name}__${student.class_name}`}>
                        {student.name} · {student.class_name} · {student.gender}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        {/* Grade / Class */}
        <div>
          <label className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Grade / Class <span className="text-destructive">*</span>
          </label>
          {classes && classes.length > 0 ? (
            <Select value={form.grade} onValueChange={(value) => setForm((prev) => ({ ...prev, grade: value }))}>
              <SelectTrigger className={getInputClass("grade")}>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((klass: any) => (
                  <SelectItem key={klass.id} value={klass.name}>{klass.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={form.grade}
              onChange={set("grade")}
              className={getInputClass("grade")}
              placeholder="e.g. Class 10, Nursery, Grade 5"
              autoComplete="off"
            />
          )}
          {errors.grade && <p className="mt-2 text-xs text-destructive">{errors.grade}</p>}
        </div>

        {/* Address */}
        <div>
          <label htmlFor="checkout-address" className="text-xs tracking-[0.2em] text-muted-foreground uppercase block mb-2">
            Delivery Address <span className="text-destructive">*</span>
          </label>
          <textarea
            id="checkout-address"
            name="address"
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
