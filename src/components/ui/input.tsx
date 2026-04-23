import * as React from "react";

import { cn } from "@/lib/utils";
import { useFieldA11y } from "@/components/ui/use-field-a11y";

type InputProps = Omit<React.ComponentProps<"input">, "id" | "name"> & {
  id?: string;
  name?: string;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, id, name, ...props }, ref) => {
    const field = useFieldA11y({ id, name, component: "input" });
    const derivedLabel = field.name.replace(/[-_]+/g, " ");
    const fallbackAriaLabel = props["aria-label"] ?? (props["aria-labelledby"] ? undefined : derivedLabel);

    return (
      <input
        id={field.id}
        name={field.name}
        aria-label={fallbackAriaLabel}
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
