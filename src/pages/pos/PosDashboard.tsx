import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import {
  AlertCircle,
  Check,
  ChevronsUpDown,
  Minus,
  Plus,
  QrCode,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PortalEmptyState,
  PortalShell,
  portalPanelClassName,
} from "@/components/dashboard/PortalShell";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/portal-dashboard";

type PaymentMethod = "cash" | "upi";

type SchoolRow = Database["public"]["Tables"]["schools"]["Row"];
type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

type SellableProduct = {
  productId: string;
  variantId: string;
  schoolId: string | null;
  name: string;
  price: number;
  category: string;
  size: string;
  stock: number;
};

type PosCartItem = SellableProduct & {
  quantity: number;
};

type PersistedCustomerSelection = {
  key: string;
  schoolId: string | null;
};

type PersistedCustomerContext = {
  alternatePhone: string;
  schoolId: string | null;
  studentClass: string;
  studentName: string;
  updatedAt: number;
};

const PAYMENT_OPTIONS: Array<{ id: PaymentMethod; label: string; icon: typeof Wallet }> = [
  { id: "cash", label: "Cash", icon: Wallet },
  { id: "upi", label: "UPI", icon: QrCode },
];

const POS_LAST_SCHOOL_KEY = "illume-pos-last-school";
const POS_LAST_CUSTOMER_KEY = "illume-pos-last-customer";
const POS_CUSTOMER_CONTEXT_KEY = "illume-pos-customer-context";
const WALK_IN_CUSTOMER_KEY = "__walk_in_customer__";

const selectPreferredVariant = (variants: any[] | null | undefined) => {
  const activeVariants = (variants ?? []).filter((variant) => !variant?.status || variant.status === "active");

  if (activeVariants.length === 0) return null;

  return [...activeVariants].sort((a, b) => {
    const aIsDefault = String(a.size ?? "").toLowerCase() === "default";
    const bIsDefault = String(b.size ?? "").toLowerCase() === "default";
    const aInStock = Number(a.stock ?? 0) > 0;
    const bInStock = Number(b.stock ?? 0) > 0;

    if (aIsDefault !== bIsDefault) return aIsDefault ? -1 : 1;
    if (aInStock !== bInStock) return aInStock ? -1 : 1;
    return Number(b.stock ?? 0) - Number(a.stock ?? 0);
  })[0];
};

const canUseLocalStorage = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const readLocalStorageValue = (key: string) => {
  if (!canUseLocalStorage()) return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeLocalStorageValue = (key: string, value: string | null) => {
  if (!canUseLocalStorage()) return;

  try {
    if (value === null) {
      window.localStorage.removeItem(key);
      return;
    }

    window.localStorage.setItem(key, value);
  } catch {
    // Ignore localStorage write errors in POS mode.
  }
};

const readJsonStorage = <T,>(key: string, fallback: T): T => {
  const rawValue = readLocalStorageValue(key);
  if (!rawValue) return fallback;

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
};

const readPersistedCustomerSelection = () =>
  readJsonStorage<PersistedCustomerSelection | null>(POS_LAST_CUSTOMER_KEY, null);

const writePersistedCustomerSelection = (value: PersistedCustomerSelection | null) => {
  if (!value) {
    writeLocalStorageValue(POS_LAST_CUSTOMER_KEY, null);
    return;
  }

  writeLocalStorageValue(POS_LAST_CUSTOMER_KEY, JSON.stringify(value));
};

const readPersistedCustomerContexts = () =>
  readJsonStorage<Record<string, PersistedCustomerContext>>(POS_CUSTOMER_CONTEXT_KEY, {});

const writePersistedCustomerContexts = (value: Record<string, PersistedCustomerContext>) => {
  writeLocalStorageValue(POS_CUSTOMER_CONTEXT_KEY, JSON.stringify(value));
};

const getCustomerContextForSchool = (customerId: string, schoolId: string | null) => {
  const customerContexts = readPersistedCustomerContexts();
  const storedContext = customerContexts[customerId];

  if (!storedContext) return null;
  if (storedContext.schoolId && schoolId && storedContext.schoolId !== schoolId) return null;

  return storedContext;
};

const PosDashboard = () => {
  const { user, role, hasAccess, loading, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(() => readLocalStorageValue(POS_LAST_SCHOOL_KEY));
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(() => readPersistedCustomerSelection()?.key ?? null);
  const [studentName, setStudentName] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [schoolPickerOpen, setSchoolPickerOpen] = useState(false);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const hydratedCustomerKeyRef = useRef<string | null>(null);

  const posRoles = ["branch_staff", "admin", "super_admin"];
  const hasPosAccess = role !== null && posRoles.includes(role);
  const isAuthorized = Boolean(user && hasAccess && hasPosAccess);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const { data: schools, isLoading: schoolsLoading } = useQuery({
    queryKey: ["pos-schools"],
    enabled: isAuthorized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, slug, code, status")
        .eq("status", "active")
        .order("name");

      if (error) throw error;
      return (data ?? []) as SchoolRow[];
    },
    staleTime: 60_000,
  });

  const { data: customers } = useQuery({
    queryKey: ["pos-customers"],
    enabled: isAuthorized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, child_school_id, child_class_id")
        .order("name");

      if (error) throw error;
      return (data ?? []) as Pick<CustomerRow, "id" | "name" | "phone" | "child_school_id" | "child_class_id">[];
    },
    staleTime: 30_000,
  });

  const { data: schoolClasses } = useQuery({
    queryKey: ["pos-school-classes", selectedSchoolId],
    enabled: isAuthorized && !!selectedSchoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, school_id, sort_order, status, code, slug, created_at")
        .eq("school_id", selectedSchoolId!)
        .eq("status", "active")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
    staleTime: 60_000,
  });

  const { data: schoolProductAssignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ["pos-product-assignments", selectedSchoolId],
    enabled: isAuthorized && !!selectedSchoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_assignments")
        .select("product_id")
        .eq("school_id", selectedSchoolId!);

      if (error) throw error;
      return (data ?? []) as Array<{ product_id: string }>;
    },
    staleTime: 30_000,
  });

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["pos-products"],
    enabled: isAuthorized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, category, school_id, is_universal, status, product_variants(id, size, stock, status, price_override)")
        .eq("status", "active")
        .order("name");

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const selectedSchool = useMemo(
    () => (schools ?? []).find((school) => school.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId],
  );

  const availableCustomers = useMemo(() => {
    if (!selectedSchoolId) return [];

    return (customers ?? []).filter((customer) => customer.child_school_id === selectedSchoolId);
  }, [customers, selectedSchoolId]);

  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerKey || selectedCustomerKey === WALK_IN_CUSTOMER_KEY) return null;
    return availableCustomers.find((customer) => customer.id === selectedCustomerKey) ?? null;
  }, [availableCustomers, selectedCustomerKey]);

  const assignedProductIds = useMemo(
    () => new Set((schoolProductAssignments ?? []).map((assignment) => assignment.product_id)),
    [schoolProductAssignments],
  );

  const sellableProducts = useMemo<SellableProduct[]>(() => {
    return (products ?? [])
      .map((product: any) => {
        const variant = selectPreferredVariant(product.product_variants);
        if (!variant) return null;

        return {
          productId: product.id,
          variantId: variant.id,
          schoolId: product.school_id ?? null,
          name: product.name,
          size: variant.size ?? "Default",
          category: product.category,
          price: Number(variant.price_override ?? product.price ?? 0),
          stock: Number(variant.stock ?? 0),
        };
      })
      .filter((product): product is SellableProduct => Boolean(product));
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!selectedSchoolId) return [];

    const scopedProducts = sellableProducts.filter((product) => {
      if (product.schoolId === selectedSchoolId) return true;
      return assignedProductIds.has(product.productId);
    });

    if (!deferredSearch) return scopedProducts;

    return scopedProducts.filter((product) =>
      [product.name, product.category, product.size].join(" ").toLowerCase().includes(deferredSearch),
    );
  }, [assignedProductIds, deferredSearch, selectedSchoolId, sellableProducts]);

  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  const totalAmount = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  );

  const selectedClassSuggestions = useMemo(
    () => (schoolClasses ?? []).map((schoolClass) => schoolClass.name),
    [schoolClasses],
  );

  const customerPhone = selectedCustomer?.phone?.trim() ?? "";
  const customerName =
    selectedCustomerKey === WALK_IN_CUSTOMER_KEY
      ? "Walk-in Customer"
      : selectedCustomer?.name?.trim() || "Unnamed Customer";
  const resolvedPhone = customerPhone || alternatePhone.trim() || "0000000000";
  const hasResolvedCustomer = selectedCustomerKey === WALK_IN_CUSTOMER_KEY || Boolean(selectedCustomer);
  const isContextReady = Boolean(
    selectedSchoolId &&
      selectedCustomerKey &&
      hasResolvedCustomer &&
      studentName.trim().length > 0 &&
      studentClass.trim().length > 0,
  );

  const missingSchool = showValidation && !selectedSchoolId;
  const missingCustomer = showValidation && !selectedCustomerKey;
  const missingStudentName = showValidation && Boolean(selectedCustomerKey) && studentName.trim().length === 0;
  const missingStudentClass = showValidation && Boolean(selectedCustomerKey) && studentClass.trim().length === 0;

  const contextChecklist = [
    !selectedSchoolId ? "select a school" : null,
    !selectedCustomerKey ? "choose a customer" : null,
    selectedCustomerKey && studentName.trim().length === 0 ? "enter student name" : null,
    selectedCustomerKey && studentClass.trim().length === 0 ? "enter class" : null,
  ].filter((value): value is string => Boolean(value));

  const fieldClassName = (isMissing: boolean) =>
    cn(
      "h-12 rounded-full border-black/10 bg-white transition-[border-color,box-shadow] duration-200",
      isMissing && "border-destructive ring-1 ring-destructive/25",
    );

  const selectSchool = (schoolId: string) => {
    if (selectedSchoolId && selectedSchoolId !== schoolId && cart.length > 0) {
      setCart([]);
      toast.info("Cart cleared after switching schools.");
    }

    setSelectedSchoolId(schoolId);
    setSelectedCustomerKey(null);
    setStudentName("");
    setStudentClass("");
    setAlternatePhone("");
    hydratedCustomerKeyRef.current = null;
    setShowValidation(false);
    setSchoolPickerOpen(false);
    setCustomerPickerOpen(false);
  };

  const selectCustomer = (customerKey: string) => {
    setSelectedCustomerKey(customerKey);
    setCustomerPickerOpen(false);
    setShowValidation(false);

    if (customerKey === WALK_IN_CUSTOMER_KEY) {
      setStudentName("");
      setStudentClass("");
      setAlternatePhone("");
      hydratedCustomerKeyRef.current = customerKey;
      return;
    }

    const storedContext = getCustomerContextForSchool(customerKey, selectedSchoolId);
    setStudentName(storedContext?.studentName ?? "");
    setStudentClass(storedContext?.studentClass ?? "");
    setAlternatePhone(storedContext?.alternatePhone ?? "");
    hydratedCustomerKeyRef.current = customerKey;
  };

  const updateQuantity = (variantId: string, quantity: number) => {
    setCart((currentCart) => {
      if (quantity <= 0) {
        return currentCart.filter((item) => item.variantId !== variantId);
      }

      return currentCart.map((item) => {
        if (item.variantId !== variantId) return item;
        return {
          ...item,
          quantity: Math.min(quantity, item.stock > 0 ? item.stock : quantity),
        };
      });
    });
  };

  const addToCart = (product: SellableProduct) => {
    if (!isContextReady) {
      setShowValidation(true);
      toast.error("Complete school, customer, and student details before billing.");
      return;
    }

    if (product.stock <= 0) {
      toast.error(`${product.name} is out of stock`);
      return;
    }

    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.variantId === product.variantId);

      if (existingItem) {
        return currentCart.map((item) =>
          item.variantId === product.variantId
            ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) }
            : item,
        );
      }

      return [...currentCart, { ...product, quantity: 1 }];
    });
  };

  const placeOrder = async () => {
    setShowValidation(true);

    if (!isContextReady) {
      toast.error("Select a school, customer, and student details before placing an order.");
      return;
    }

    if (cart.length === 0) {
      toast.error("Add products before placing an order");
      return;
    }

    setPlacingOrder(true);

    try {
      const variantIds = cart.map((item) => item.variantId);
      const { data: variants, error: variantError } = await supabase
        .from("product_variants")
        .select("id, stock")
        .in("id", variantIds);

      if (variantError) throw variantError;

      const stockMap = new Map((variants ?? []).map((variant) => [variant.id, Number(variant.stock ?? 0)]));
      const insufficientItem = cart.find((item) => (stockMap.get(item.variantId) ?? 0) < item.quantity);

      if (insufficientItem) {
        toast.error(`${insufficientItem.name} no longer has enough stock`);
        return;
      }

      const normalizedAlternatePhone = alternatePhone.trim();
      const customerId = selectedCustomerKey && selectedCustomerKey !== WALK_IN_CUSTOMER_KEY
        ? selectedCustomerKey
        : null;
      const compatibleOrderPayload = {
        customer_name: customerName,
        phone: resolvedPhone,
        address: `POS Counter - ${selectedSchool?.name ?? "School Billing"}`,
        school_id: selectedSchoolId,
        total_amount: totalAmount,
        status: "confirmed",
      };

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert(compatibleOrderPayload)
        .select("id, total_amount")
        .single();

      if (orderError) throw orderError;
      if (!order) throw new Error("Order was not created");

      const orderItems = cart.map((item) => ({
        order_id: order.id,
        product_id: item.productId,
        variant_id: item.variantId,
        quantity: item.quantity,
        price: item.price,
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) throw itemsError;

      for (const item of cart) {
        const previousStock = stockMap.get(item.variantId) ?? 0;
        const { data: updatedVariant, error: updateError } = await supabase
          .from("product_variants")
          .update({ stock: previousStock - item.quantity })
          .eq("id", item.variantId)
          .gte("stock", item.quantity)
          .select("stock")
          .single();

        if (updateError) throw updateError;

        const { error: logError } = await supabase.from("inventory_logs").insert({
          product_id: item.productId,
          variant_id: item.variantId,
          change_type: "order",
          quantity_change: -item.quantity,
          previous_stock: previousStock,
          new_stock: Number(updatedVariant?.stock ?? previousStock - item.quantity),
          order_id: order.id,
        });

        if (logError) throw logError;
      }

      await supabase.from("order_notes").insert({
        order_id: order.id,
        note: [
          "Order Source: POS",
          `School: ${selectedSchool?.name ?? "Unknown School"}`,
          `Customer: ${customerName}`,
          `Payment Method: ${paymentMethod.toUpperCase()}`,
          `Student Name: ${studentName.trim()}`,
          `Student Class: ${studentClass.trim()}`,
          `Alternate Phone: ${normalizedAlternatePhone || "—"}`,
          `Handled By: ${user.email ?? "POS Team"}`,
        ].join("\n"),
      });

      if (customerId) {
        const nextCustomerContexts = readPersistedCustomerContexts();
        nextCustomerContexts[customerId] = {
          alternatePhone: normalizedAlternatePhone,
          schoolId: selectedSchoolId,
          studentClass: studentClass.trim(),
          studentName: studentName.trim(),
          updatedAt: Date.now(),
        };
        writePersistedCustomerContexts(nextCustomerContexts);
      }

      setCart([]);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pos-products"] }),
        queryClient.invalidateQueries({ queryKey: ["vendor-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["school-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["school-portal"] }),
      ]);

      toast.success(`Order ${order.id.slice(0, 8).toUpperCase()} placed successfully`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to place POS order");
    } finally {
      setPlacingOrder(false);
    }
  };

  useEffect(() => {
    if (!selectedSchoolId) {
      writeLocalStorageValue(POS_LAST_SCHOOL_KEY, null);
      return;
    }

    writeLocalStorageValue(POS_LAST_SCHOOL_KEY, selectedSchoolId);
  }, [selectedSchoolId]);

  useEffect(() => {
    if (!selectedCustomerKey) {
      hydratedCustomerKeyRef.current = null;
      writePersistedCustomerSelection(null);
      return;
    }

    writePersistedCustomerSelection({
      key: selectedCustomerKey,
      schoolId: selectedSchoolId,
    });
  }, [selectedCustomerKey, selectedSchoolId]);

  useEffect(() => {
    if (!selectedCustomerKey) return;
    if (hydratedCustomerKeyRef.current === selectedCustomerKey) return;

    if (selectedCustomerKey === WALK_IN_CUSTOMER_KEY) {
      setStudentName("");
      setStudentClass("");
      setAlternatePhone("");
      hydratedCustomerKeyRef.current = selectedCustomerKey;
      return;
    }

    if (!selectedCustomer) return;

    const storedContext = getCustomerContextForSchool(selectedCustomerKey, selectedSchoolId);
    setStudentName(storedContext?.studentName ?? "");
    setStudentClass(storedContext?.studentClass ?? "");
    setAlternatePhone(storedContext?.alternatePhone ?? "");
    hydratedCustomerKeyRef.current = selectedCustomerKey;
  }, [selectedCustomer, selectedCustomerKey, selectedSchoolId]);

  useEffect(() => {
    if (!schools?.length) return;
    if (selectedSchoolId && schools.some((school) => school.id === selectedSchoolId)) return;

    setSelectedSchoolId(null);
  }, [schools, selectedSchoolId]);

  useEffect(() => {
    if (!selectedSchoolId) return;
    if (selectedCustomerKey) return;

    const storedSelection = readPersistedCustomerSelection();
    if (!storedSelection || storedSelection.schoolId !== selectedSchoolId) return;

    if (storedSelection.key === WALK_IN_CUSTOMER_KEY) {
      setSelectedCustomerKey(WALK_IN_CUSTOMER_KEY);
      return;
    }

    if (availableCustomers.some((customer) => customer.id === storedSelection.key)) {
      setSelectedCustomerKey(storedSelection.key);
    }
  }, [availableCustomers, selectedCustomerKey, selectedSchoolId]);

  useEffect(() => {
    if (!selectedCustomerKey || selectedCustomerKey === WALK_IN_CUSTOMER_KEY) return;
    if (availableCustomers.some((customer) => customer.id === selectedCustomerKey)) return;

    setSelectedCustomerKey(null);
    setStudentName("");
    setStudentClass("");
    setAlternatePhone("");
    hydratedCustomerKeyRef.current = null;
  }, [availableCustomers, selectedCustomerKey]);

  useEffect(() => {
    if (!selectedCustomerKey || selectedCustomerKey === WALK_IN_CUSTOMER_KEY) return;
    if (!selectedCustomer?.child_class_id || studentClass.trim().length > 0 || !schoolClasses?.length) return;

    const matchedClass = schoolClasses.find((schoolClass) => schoolClass.id === selectedCustomer.child_class_id);
    if (matchedClass) {
      setStudentClass(matchedClass.name);
    }
  }, [schoolClasses, selectedCustomer, selectedCustomerKey, studentClass]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!isAuthorized) {
    return <Navigate to="/pos/login" replace />;
  }

  return (
    <PortalShell
      title="POS Billing"
      subtitle={user.email ?? "Counter billing terminal"}
      onSignOut={signOut}
      scopeLabel={`${cartCount} item${cartCount === 1 ? "" : "s"} in cart`}
    >
      <Card className={portalPanelClassName}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Billing Context
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-1">
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">School</p>
              <Popover open={schoolPickerOpen} onOpenChange={setSchoolPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "h-12 w-full justify-between rounded-full border-black/10 bg-white px-4 text-left font-normal hover:bg-white",
                      missingSchool && "border-destructive ring-1 ring-destructive/25",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">
                        {selectedSchool?.name ?? (schoolsLoading ? "Loading schools..." : "Select school")}
                      </span>
                    </span>
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search school" />
                    <CommandList>
                      <CommandEmpty>No schools found.</CommandEmpty>
                      <CommandGroup heading="Schools">
                        {(schools ?? []).map((school) => (
                          <CommandItem
                            key={school.id}
                            value={`${school.name} ${school.code ?? ""}`}
                            onSelect={() => selectSchool(school.id)}
                            className="flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{school.name}</p>
                              {school.code ? (
                                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{school.code}</p>
                              ) : null}
                            </div>
                            <Check
                              className={cn(
                                "h-4 w-4 text-foreground transition-opacity",
                                selectedSchoolId === school.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Customer</p>
              <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!selectedSchoolId}
                    className={cn(
                      "h-12 w-full justify-between rounded-full border-black/10 bg-white px-4 text-left font-normal hover:bg-white disabled:cursor-not-allowed disabled:opacity-70",
                      missingCustomer && "border-destructive ring-1 ring-destructive/25",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <UserRound className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">
                        {selectedCustomerKey === WALK_IN_CUSTOMER_KEY
                          ? "Walk-in Customer"
                          : selectedCustomer?.name?.trim() || "Select customer"}
                      </span>
                    </span>
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search customer or phone" />
                    <CommandList>
                      <CommandEmpty>No customers found for this school.</CommandEmpty>
                      <CommandGroup heading="Options">
                        <CommandItem
                          value="walk in customer"
                          onSelect={() => selectCustomer(WALK_IN_CUSTOMER_KEY)}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">Walk-in Customer</p>
                            <p className="text-xs text-muted-foreground">Use a one-time counter billing record.</p>
                          </div>
                          <Check
                            className={cn(
                              "h-4 w-4 text-foreground transition-opacity",
                              selectedCustomerKey === WALK_IN_CUSTOMER_KEY ? "opacity-100" : "opacity-0",
                            )}
                          />
                        </CommandItem>
                      </CommandGroup>
                      <CommandGroup heading="Customers">
                        {availableCustomers.map((customer) => (
                          <CommandItem
                            key={customer.id}
                            value={`${customer.name ?? ""} ${customer.phone ?? ""}`}
                            onSelect={() => selectCustomer(customer.id)}
                            className="flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {customer.name?.trim() || "Unnamed customer"}
                              </p>
                              <p className="text-xs text-muted-foreground">{customer.phone?.trim() || "No phone saved"}</p>
                            </div>
                            <Check
                              className={cn(
                                "h-4 w-4 text-foreground transition-opacity",
                                selectedCustomerKey === customer.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Student Name</p>
              <Input
                value={studentName}
                onChange={(event) => setStudentName(event.target.value)}
                disabled={!selectedCustomerKey}
                placeholder={selectedCustomerKey ? "Enter student name" : "Select customer first"}
                className={fieldClassName(missingStudentName)}
              />
            </div>

            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Class</p>
              <Input
                value={studentClass}
                onChange={(event) => setStudentClass(event.target.value)}
                disabled={!selectedCustomerKey}
                list="pos-school-classes"
                placeholder={selectedCustomerKey ? "Enter class" : "Select customer first"}
                className={fieldClassName(missingStudentClass)}
              />
              <datalist id="pos-school-classes">
                {selectedClassSuggestions.map((className) => (
                  <option key={className} value={className} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Alt Phone</p>
              <Input
                value={alternatePhone}
                onChange={(event) => setAlternatePhone(event.target.value)}
                disabled={!selectedCustomerKey}
                placeholder={selectedCustomerKey ? "Optional" : "Select customer first"}
                className="h-12 rounded-full border-black/10 bg-white"
              />
            </div>
          </div>

          <div
            className={cn(
              "flex flex-col gap-2 rounded-[22px] border px-4 py-3 text-sm",
              isContextReady
                ? "border-emerald-200 bg-emerald-50/80 text-emerald-950"
                : "border-amber-200 bg-amber-50/90 text-amber-950",
            )}
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="leading-6">
                {isContextReady
                  ? `Billing is ready for ${selectedSchool?.name ?? "the selected school"} and ${customerName}.`
                  : `Before billing, ${contextChecklist.join(", ")}.`}
              </p>
            </div>
            <p className="text-xs text-current/75">
              {selectedCustomer
                ? `Customer phone: ${customerPhone || "No phone saved"}`
                : selectedCustomerKey === WALK_IN_CUSTOMER_KEY
                  ? alternatePhone.trim()
                    ? `Walk-in contact will be saved as ${alternatePhone.trim()}.`
                    : "Walk-in customer selected. Add an alternate phone if you want to save a contact number."
                  : "Select a school first, then choose an existing customer or Walk-in Customer."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className={portalPanelClassName}>
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-lg">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              className="h-12 rounded-full border-black/10 bg-white pl-11 pr-4"
            />
          </div>

          <div className="flex items-center justify-between rounded-full border border-black/10 bg-stone-50 px-4 py-3 md:min-w-[190px]">
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Current Cart</span>
            <span className="text-lg font-medium text-foreground">{cartCount}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className={portalPanelClassName}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Product List
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {!selectedSchoolId ? (
              <PortalEmptyState
                title="School Selection Required"
                description="Choose a school above to load school-specific products and begin POS billing."
              />
            ) : productsLoading || assignmentsLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-40 rounded-[24px] border border-border/70 bg-stone-50/80 animate-pulse" />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <PortalEmptyState
                title="No Products Found"
                description="Try a different search or confirm that this school has active products assigned."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => {
                  const isOutOfStock = product.stock <= 0;
                  const isAddDisabled = isOutOfStock || !isContextReady;

                  return (
                    <div
                      key={product.variantId}
                      className="flex h-full flex-col justify-between rounded-[24px] border border-black/5 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(247,244,239,0.95))] p-4 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.55)]"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-medium text-foreground">{product.name}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                              {product.category}
                            </p>
                          </div>
                          <div className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                            {product.size}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-2xl font-extralight tracking-tight text-foreground">
                            {formatCurrency(product.price)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {isOutOfStock ? "Out of stock" : `${product.stock} available`}
                          </p>
                        </div>
                      </div>

                      <Button
                        onClick={() => addToCart(product)}
                        disabled={isAddDisabled}
                        className="mt-5 h-11 rounded-full text-[11px] uppercase tracking-[0.22em]"
                      >
                        Add
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={cn(portalPanelClassName, "xl:sticky xl:top-6 xl:self-start")}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                Cart
              </CardTitle>
              <div className="flex items-center gap-2 rounded-full border border-black/10 bg-stone-50 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                <ShoppingBag className="h-3.5 w-3.5" />
                {cartCount} selected
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            {cart.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-black/10 bg-stone-50/80 px-5 py-10 text-center">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-foreground">Cart is empty</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {isContextReady
                    ? "Add a product from the grid to begin billing."
                    : "Complete the billing context above before adding products."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div
                    key={item.variantId}
                    className="rounded-[22px] border border-black/5 bg-stone-50/80 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.size}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.variantId, 0)}
                        className="rounded-full border border-black/10 p-2 text-muted-foreground transition hover:bg-white hover:text-foreground"
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                          className="rounded-full p-1 text-muted-foreground transition hover:bg-stone-100 hover:text-foreground"
                          aria-label={`Decrease ${item.name}`}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-8 text-center text-sm font-medium text-foreground">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                          className="rounded-full p-1 text-muted-foreground transition hover:bg-stone-100 hover:text-foreground"
                          aria-label={`Increase ${item.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>

                      <p className="text-sm font-medium text-foreground">
                        {formatCurrency(item.price * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-[22px] border border-black/10 bg-white p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="uppercase tracking-[0.2em] text-muted-foreground">Total Amount</span>
                <span className="text-xl font-medium text-foreground">{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={portalPanelClassName}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Payment
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            {PAYMENT_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = paymentMethod === option.id;

              return (
                <Button
                  key={option.id}
                  type="button"
                  variant="outline"
                  onClick={() => setPaymentMethod(option.id)}
                  className={cn(
                    "h-11 rounded-full border-black/10 px-5 text-[11px] uppercase tracking-[0.22em]",
                    selected && "border-black bg-black text-white hover:bg-black/90 hover:text-white",
                  )}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {option.label}
                </Button>
              );
            })}
          </div>

          <Button
            onClick={placeOrder}
            disabled={cart.length === 0 || placingOrder || !isContextReady}
            className="h-11 rounded-full px-6 text-[11px] uppercase tracking-[0.24em] lg:min-w-[220px]"
          >
            {placingOrder ? "Placing Order..." : "Place Order"}
          </Button>
        </CardContent>
      </Card>
    </PortalShell>
  );
};

export default PosDashboard;
