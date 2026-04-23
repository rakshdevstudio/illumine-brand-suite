import { FormEvent, useId, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONTACT_DETAILS, CONTACT_ENQUIRY_TYPES } from "@/lib/contact";
import { useContactModal } from "@/lib/contact-modal";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type ContactFormValues = {
  name: string;
  phone: string;
  email: string;
  type: string;
  message: string;
};

type ContactFormErrors = Partial<Record<keyof ContactFormValues, string>>;

const formReveal = {
  hidden: { opacity: 0, y: 28 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      delay,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

const createInitialValues = (): ContactFormValues => ({
  name: "",
  phone: "",
  email: "",
  type: "",
  message: "",
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getPhoneDigits = (value: string) => value.replace(/\D/g, "");

const isPhoneValid = (value: string) => {
  const digits = getPhoneDigits(value);
  if (digits.length === 10) return true;
  return digits.length === 12 && digits.startsWith("91");
};

const openMaps = () => {
  if (typeof window === "undefined") return;
  window.open(CONTACT_DETAILS.mapDirectionsUrl, "_blank", "noopener,noreferrer");
};

const validateField = (
  field: keyof ContactFormValues,
  values: ContactFormValues,
): string | undefined => {
  if (field === "name") {
    if (!values.name.trim()) return "Please enter your name";
    if (values.name.trim().length < 2) return "Name should be at least 2 characters";
  }

  if (field === "phone") {
    if (!values.phone.trim()) return "Please enter your phone number";
    if (!isPhoneValid(values.phone)) return "Enter a valid 10-digit phone number";
  }

  if (field === "email") {
    if (!values.email.trim()) return "Please enter your email";
    if (!EMAIL_REGEX.test(values.email.trim())) return "Enter a valid email address";
  }

  if (field === "type" && !values.type.trim()) {
    return "Please choose an enquiry type";
  }

  if (field === "message") {
    if (!values.message.trim()) return "Please tell us how we can help";
    if (values.message.trim().length < 10) return "Message should be at least 10 characters";
  }

  return undefined;
};

const validateForm = (values: ContactFormValues): ContactFormErrors => {
  const fields: (keyof ContactFormValues)[] = ["name", "phone", "email", "type", "message"];
  return fields.reduce<ContactFormErrors>((errors, field) => {
    const error = validateField(field, values);
    if (error) errors[field] = error;
    return errors;
  }, {});
};

const FloatingInput = ({
  name,
  label,
  type = "text",
  value,
  onChange,
  onBlur,
  autoComplete,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  autoComplete?: string;
  error?: string;
}) => {
  const id = useId();
  const [isFocused, setIsFocused] = useState(false);
  const isFloating = isFocused || value.trim().length > 0;

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            onBlur();
          }}
          className={cn(
            "h-16 w-full rounded-[26px] border bg-white/92 px-5 pb-3 pt-7 text-sm text-slate-900 outline-none transition-all duration-300",
            "shadow-[0_14px_36px_rgba(15,23,42,0.06)] backdrop-blur-sm",
            "focus:border-slate-900 focus:shadow-[0_24px_60px_rgba(15,23,42,0.10)]",
            error ? "border-red-300" : "border-black/10 hover:border-black/20",
          )}
        />
        <label
          htmlFor={id}
          className={cn(
            "pointer-events-none absolute left-5 text-slate-500 transition-all duration-200",
            isFloating ? "top-3 text-[11px] uppercase tracking-[0.22em]" : "top-1/2 -translate-y-1/2 text-sm",
          )}
        >
          {label}
        </label>
      </div>
      {error ? <p className="px-1 text-xs text-red-500">{error}</p> : null}
    </div>
  );
};

const FloatingTextarea = ({
  name,
  label,
  value,
  onChange,
  onBlur,
  error,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
}) => {
  const id = useId();
  const [isFocused, setIsFocused] = useState(false);
  const isFloating = isFocused || value.trim().length > 0;

  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          id={id}
          name={name}
          value={value}
          rows={5}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            onBlur();
          }}
          className={cn(
            "min-h-[168px] w-full rounded-[28px] border bg-white/92 px-5 pb-4 pt-8 text-sm text-slate-900 outline-none transition-all duration-300",
            "shadow-[0_14px_36px_rgba(15,23,42,0.06)] backdrop-blur-sm resize-none",
            "focus:border-slate-900 focus:shadow-[0_24px_60px_rgba(15,23,42,0.10)]",
            error ? "border-red-300" : "border-black/10 hover:border-black/20",
          )}
        />
        <label
          htmlFor={id}
          className={cn(
            "pointer-events-none absolute left-5 text-slate-500 transition-all duration-200",
            isFloating ? "top-3 text-[11px] uppercase tracking-[0.22em]" : "top-6 text-sm",
          )}
        >
          {label}
        </label>
      </div>
      {error ? <p className="px-1 text-xs text-red-500">{error}</p> : null}
    </div>
  );
};

const FloatingSelect = ({
  name,
  label,
  value,
  options,
  onChange,
  onBlur,
  error,
}: {
  name: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
}) => {
  const id = useId();
  const [isFocused, setIsFocused] = useState(false);
  const isFloating = isFocused || value.trim().length > 0;

  return (
    <div className="space-y-2">
      <div className="relative">
        <select
          id={id}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            onBlur();
          }}
          className={cn(
            "h-16 w-full appearance-none rounded-[26px] border bg-white/92 px-5 pb-3 pt-7 text-sm text-slate-900 outline-none transition-all duration-300",
            "shadow-[0_14px_36px_rgba(15,23,42,0.06)] backdrop-blur-sm",
            "focus:border-slate-900 focus:shadow-[0_24px_60px_rgba(15,23,42,0.10)]",
            error ? "border-red-300" : "border-black/10 hover:border-black/20",
            !value ? "text-transparent" : "",
          )}
        >
          <option value="" disabled>
            {label}
          </option>
          {options.map((option) => (
            <option key={option} value={option} className="text-slate-900">
              {option}
            </option>
          ))}
        </select>
        <label
          htmlFor={id}
          className={cn(
            "pointer-events-none absolute left-5 text-slate-500 transition-all duration-200",
            isFloating ? "top-3 text-[11px] uppercase tracking-[0.22em]" : "top-1/2 -translate-y-1/2 text-sm",
          )}
        >
          {label}
        </label>
        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
      {error ? <p className="px-1 text-xs text-red-500">{error}</p> : null}
    </div>
  );
};

const ContactActions = ({ stacked = false }: { stacked?: boolean }) => (
  <div className={cn("flex flex-wrap gap-3", stacked && "flex-col sm:flex-row")}>
    <a
      href={CONTACT_DETAILS.whatsappHref}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-full bg-[#111111] px-5 py-3 text-sm text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(17,17,17,0.20)]"
    >
      <MessageCircle className="h-4 w-4" />
      Chat on WhatsApp
    </a>
    <a
      href={CONTACT_DETAILS.phoneHref}
      className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-slate-900 transition-all duration-300 hover:-translate-y-0.5 hover:border-black/20 hover:shadow-[0_18px_36px_rgba(15,23,42,0.10)]"
    >
      <Phone className="h-4 w-4" />
      Call Now
    </a>
  </div>
);

const ContactInfoPanel = ({
  title,
  description,
  variant = "page",
}: {
  title: string;
  description: string;
  variant?: "page" | "modal";
}) => (
  <div
    className={cn(
      "relative overflow-hidden rounded-[32px] border border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,247,250,0.92))] p-7 shadow-[0_30px_80px_rgba(15,23,42,0.08)] md:p-10",
      variant === "modal" && "h-full rounded-none border-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.94))] shadow-none",
    )}
  >
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,23,42,0.06),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(15,23,42,0.06),transparent_30%)]" />
    <div className="relative space-y-8">
      <div className="space-y-4">
        <span className="inline-flex rounded-full border border-black/10 bg-white/90 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
          Contact Us
        </span>
        <div className="space-y-3">
          <h2 className="max-w-sm text-3xl font-medium leading-tight tracking-[-0.03em] text-slate-950 md:text-[2.6rem]">
            {title}
          </h2>
          <p className="max-w-md text-sm leading-7 text-slate-600 md:text-base">
            {description}
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        <a
          href={CONTACT_DETAILS.phoneHref}
          className="group rounded-[26px] border border-black/8 bg-white/90 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(15,23,42,0.09)]"
        >
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <Phone className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Phone</p>
              <p className="text-base text-slate-950 transition-colors group-hover:text-slate-700">
                {CONTACT_DETAILS.phoneDisplay}
              </p>
            </div>
          </div>
        </a>

        <a
          href={`mailto:${CONTACT_DETAILS.email}`}
          className="group rounded-[26px] border border-black/8 bg-white/90 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(15,23,42,0.09)]"
        >
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <Mail className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Email</p>
              <p className="text-base text-slate-950 transition-colors group-hover:text-slate-700">
                {CONTACT_DETAILS.email}
              </p>
            </div>
          </div>
        </a>

        <div className="rounded-[26px] border border-black/8 bg-white/90 p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <MapPin className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Address</p>
              {CONTACT_DETAILS.addressLines.map((line) => (
                <p key={line} className="text-base leading-7 text-slate-950">
                  {line}
                </p>
              ))}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={openMaps}
                  aria-label="Get directions on Google Maps"
                  className="group inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm text-slate-900 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-[0_14px_30px_rgba(15,23,42,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/25"
                >
                  <span aria-hidden="true">📍</span>
                  <span>Get Directions</span>
                  <ExternalLink className="h-3.5 w-3.5 text-slate-500 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
                <p className="mt-2 text-xs text-slate-500">Navigate instantly via Google Maps</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[26px] border border-black/8 bg-white/90 p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <Clock3 className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Timing</p>
              <p className="text-base text-slate-950">{CONTACT_DETAILS.timing}</p>
              <p className="text-sm text-slate-500">{CONTACT_DETAILS.responsePromise}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Or chat instantly with our team for sizing, bulk orders, or school onboarding support.
        </p>
        <ContactActions stacked />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {["Response in 24 hrs", "Bulk school support", "Premium fit guidance"].map((item) => (
          <div
            key={item}
            className="rounded-full border border-black/8 bg-white/85 px-4 py-3 text-center text-[11px] uppercase tracking-[0.2em] text-slate-600"
          >
            {item}
          </div>
        ))}
      </div>

      {variant === "modal" ? (
        <div className="overflow-hidden rounded-[28px] border border-black/8 bg-white p-2 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <iframe
            title="Illume location map"
            src={CONTACT_DETAILS.mapEmbedUrl}
            loading="lazy"
            className="h-56 w-full rounded-[22px] border-0"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      ) : null}
    </div>
  </div>
);

const ContactFormCard = ({
  title,
  description,
  mode = "page",
  onSuccess,
}: {
  title: string;
  description: string;
  mode?: "page" | "modal";
  onSuccess?: () => void;
}) => {
  const { toast } = useToast();
  const [values, setValues] = useState<ContactFormValues>(createInitialValues);
  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof ContactFormValues, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const setFieldValue = (field: keyof ContactFormValues, nextValue: string) => {
    setValues((current) => ({ ...current, [field]: nextValue }));

    if (touched[field]) {
      setErrors((current) => ({
        ...current,
        [field]: validateField(field, { ...values, [field]: nextValue }),
      }));
    }
  };

  const touchField = (field: keyof ContactFormValues) => {
    setTouched((current) => ({ ...current, [field]: true }));
    setErrors((current) => ({
      ...current,
      [field]: validateField(field, values),
    }));
  };

  const resetForm = () => {
    setValues(createInitialValues());
    setErrors({});
    setTouched({});
    setIsSubmitted(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateForm(values);
    setErrors(nextErrors);
    setTouched({
      name: true,
      phone: true,
      email: true,
      type: true,
      message: true,
    });

    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);

    const { error } = await supabase.from("contact_messages").insert({
      name: values.name.trim(),
      phone: values.phone.trim(),
      email: values.email.trim().toLowerCase(),
      type: values.type.trim(),
      message: values.message.trim(),
    });

    setIsSubmitting(false);

    if (error) {
      toast({
        title: "Message not sent",
        description: "Please try again in a moment or contact us on WhatsApp.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitted(true);
    onSuccess?.();
  };

  return (
    <div
      className={cn(
        "rounded-[32px] border border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,250,251,0.96))] p-7 shadow-[0_30px_80px_rgba(15,23,42,0.08)] md:p-10",
        mode === "modal" && "rounded-none border-0 bg-transparent p-0 shadow-none",
      )}
    >
      {isSubmitted ? (
        <div className="flex min-h-[540px] flex-col items-start justify-center rounded-[28px] border border-emerald-100 bg-emerald-50/70 p-8">
          <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_18px_36px_rgba(5,150,105,0.22)]">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-700">Success</p>
          <h3 className="mt-3 text-3xl font-medium tracking-[-0.03em] text-slate-950">
            Message sent successfully.
          </h3>
          <p className="mt-4 max-w-md text-base leading-7 text-slate-600">
            We&apos;ll contact you within 24 hours. If your request is urgent, you can also chat with us on WhatsApp right away.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ContactActions />
            <Button
              type="button"
              variant="outline"
              onClick={resetForm}
              className="h-12 rounded-full border-black/10 px-5 text-sm font-normal"
            >
              Send another message
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-3">
            <span className="inline-flex rounded-full border border-black/10 bg-white/90 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
              Get in Touch
            </span>
            <div className="space-y-2">
              <h3 className="text-3xl font-medium tracking-[-0.03em] text-slate-950">{title}</h3>
              <p className="max-w-lg text-sm leading-7 text-slate-600">{description}</p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <FloatingInput
              name="name"
              label="Name"
              value={values.name}
              onChange={(value) => setFieldValue("name", value)}
              onBlur={() => touchField("name")}
              autoComplete="name"
              error={errors.name}
            />
            <FloatingInput
              name="phone"
              label="Phone"
              type="tel"
              value={values.phone}
              onChange={(value) => setFieldValue("phone", value)}
              onBlur={() => touchField("phone")}
              autoComplete="tel"
              error={errors.phone}
            />
            <FloatingInput
              name="email"
              label="Email"
              type="email"
              value={values.email}
              onChange={(value) => setFieldValue("email", value)}
              onBlur={() => touchField("email")}
              autoComplete="email"
              error={errors.email}
            />
            <FloatingSelect
              name="type"
              label="Enquiry Type"
              value={values.type}
              options={CONTACT_ENQUIRY_TYPES}
              onChange={(value) => setFieldValue("type", value)}
              onBlur={() => touchField("type")}
              error={errors.type}
            />
          </div>

          <FloatingTextarea
            name="message"
            label="Message"
            value={values.message}
            onChange={(value) => setFieldValue("message", value)}
            onBlur={() => touchField("message")}
            error={errors.message}
          />

          <div className="flex flex-col gap-4 border-t border-black/8 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm leading-7 text-slate-500">
              Or chat instantly
              <span className="mx-2 text-black/20">→</span>
              <a
                href={CONTACT_DETAILS.whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-slate-950 transition-colors hover:text-slate-600"
              >
                WhatsApp
              </a>
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-14 rounded-full bg-slate-950 px-6 text-sm font-normal text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_28px_70px_rgba(15,23,42,0.24)]"
            >
              {isSubmitting ? "Sending... ⏳" : "Send Message"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};

export const ContactHero = () => (
  <section className="relative overflow-hidden">
    <div className="absolute inset-0">
      <img
        src={CONTACT_DETAILS.heroImageUrl}
        alt="Children in school uniforms smiling together"
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,15,25,0.18),rgba(8,15,25,0.52))]" />
    </div>

    <div className="relative mx-auto flex min-h-[78vh] w-full max-w-7xl items-end px-6 py-14 md:min-h-[86vh] md:px-8 md:py-20">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-2xl rounded-[34px] border border-white/20 bg-white/10 p-7 text-white shadow-[0_30px_100px_rgba(15,23,42,0.22)] backdrop-blur-xl md:p-10"
      >
        <p className="text-[11px] uppercase tracking-[0.28em] text-white/70">Contact Us</p>
        <h1 className="mt-4 text-4xl font-medium tracking-[-0.04em] md:text-6xl">
          We&apos;re here to help you
        </h1>
        <p className="mt-5 max-w-xl text-sm leading-7 text-white/80 md:text-base">
          Reach out anytime for school onboarding, bulk orders, sizing support, or help with your next uniform enquiry.
        </p>
        <div className="mt-8">
          <ContactActions />
        </div>
      </motion.div>
    </div>
  </section>
);

export const ContactMainSection = () => (
  <section className="bg-[linear-gradient(180deg,#f8f8f6_0%,#ffffff_100%)] px-6 py-16 md:px-8 md:py-24">
    <div className="mx-auto max-w-7xl">
      <div className="mb-10 max-w-2xl space-y-4">
        <motion.p
          variants={formReveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          custom={0}
          className="text-[11px] uppercase tracking-[0.28em] text-slate-500"
        >
          Premium Support
        </motion.p>
        <motion.h2
          variants={formReveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          custom={0.08}
          className="text-3xl font-medium tracking-[-0.04em] text-slate-950 md:text-5xl"
        >
          A calm, premium contact experience for busy parents and schools.
        </motion.h2>
      </div>

      <div className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr]">
        <motion.div
          variants={formReveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          custom={0.12}
        >
          <ContactInfoPanel
            title="We’re always ready to help you."
            description="Whether you need quick answers, sizing support, or a school-wide uniform solution, our team is ready with thoughtful guidance and fast responses."
          />
        </motion.div>

        <motion.div
          variants={formReveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          custom={0.18}
        >
          <ContactFormCard
            title="Get in Touch"
            description="Share a few details and our team will get back to you with the right next steps."
          />
        </motion.div>
      </div>
    </div>
  </section>
);

export const ContactMapSection = () => (
  <section className="bg-white px-6 pb-16 md:px-8 md:pb-24">
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Visit Us</p>
        <h2 className="text-3xl font-medium tracking-[-0.04em] text-slate-950 md:text-4xl">
          Find us in Bengaluru
        </h2>
      </div>
      <div className="overflow-hidden rounded-[34px] border border-black/8 bg-white p-3 shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
        <iframe
          title="Illume full map"
          src={CONTACT_DETAILS.mapEmbedUrl}
          loading="lazy"
          className="h-[460px] w-full rounded-[28px] border-0"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  </section>
);

export const ContactModal = () => {
  const isOpen = useContactModal((state) => state.isOpen);
  const closeModal = useContactModal((state) => state.closeModal);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeModal();
      }}
    >
      <DialogContent className="max-h-[92vh] w-[calc(100vw-24px)] max-w-6xl overflow-hidden rounded-[36px] border border-white/40 bg-white/85 p-0 shadow-[0_50px_140px_rgba(15,23,42,0.28)] backdrop-blur-2xl">
        <div className="grid max-h-[92vh] overflow-y-auto lg:grid-cols-[1.08fr_0.92fr]">
          <div className="p-6 md:p-8 lg:p-10">
            <div className="mb-8 max-w-lg space-y-3">
              <DialogTitle className="text-3xl font-medium tracking-[-0.04em] text-slate-950">
                Contact Us
              </DialogTitle>
              <DialogDescription className="text-sm leading-7 text-slate-600">
                A fast, premium contact experience for parents, schools, and uniform enquiries.
              </DialogDescription>
            </div>

            <ContactFormCard
              mode="modal"
              title="Get in Touch"
              description="Fill in the form below and we’ll come back with the right help, quickly."
            />
          </div>

          <div className="min-h-full lg:border-l lg:border-black/6">
            <ContactInfoPanel
              variant="modal"
              title="We’re always ready to help you."
              description="Call, email, or chat on WhatsApp if you want a quicker conversation about school uniforms, fittings, or onboarding."
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
