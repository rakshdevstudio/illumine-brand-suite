import * as React from "react";

import { cn } from "@/lib/utils";
import { useFieldA11y } from "@/components/ui/use-field-a11y";

export type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "name"> & {
  id?: string;
  name?: string;
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, id, name, ...props }, ref) => {
  const field = useFieldA11y({ id, name, component: "textarea" });
  const derivedLabel = field.name.replace(/[-_]+/g, " ");
  const fallbackAriaLabel = props["aria-label"] ?? (props["aria-labelledby"] ? undefined : derivedLabel);

  return (
    <textarea
      id={field.id}
      name={field.name}
      aria-label={fallbackAriaLabel}
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
