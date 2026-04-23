import * as React from "react";

type UseFieldA11yOptions = {
  id?: string;
  name?: string;
  component: string;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export const useFieldA11y = ({ id, name, component }: UseFieldA11yOptions) => {
  const reactId = React.useId();
  const stableSuffixRef = React.useRef(reactId.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase());

  const normalizedName = (name ?? "").trim();
  const generatedName = `${slugify(component)}-${stableSuffixRef.current}`;
  const resolvedName = normalizedName || generatedName;

  const normalizedId = (id ?? "").trim();
  const baseId = slugify(resolvedName) || generatedName;
  const resolvedId = normalizedId || `${baseId}-field`;

  React.useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (normalizedName) return;

    // Backward compatible soft enforcement: auto-fix missing name and warn in dev.
    console.warn(
      `[a11y] ${component} rendered without a name prop. Auto-generated name "${resolvedName}" was applied.`,
    );
  }, [component, normalizedName, resolvedName]);

  return {
    id: resolvedId,
    name: resolvedName,
  };
};
