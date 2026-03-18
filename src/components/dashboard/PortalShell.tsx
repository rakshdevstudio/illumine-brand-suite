import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import illumeLogo from "@/assets/logo.png";

export const portalPanelClassName =
  "rounded-[28px] border border-border/70 bg-white/90 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm";

export const PortalShell = ({
  title,
  subtitle,
  onSignOut,
  scopeLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  onSignOut: () => void | Promise<void>;
  scopeLabel?: string;
  children: ReactNode;
}) => (
  <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(244,241,234,0.95),_transparent_38%),linear-gradient(180deg,_#fbfaf7_0%,_#f5f3ee_100%)] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 rounded-[30px] border border-black/5 bg-white/70 px-5 py-5 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.45)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-sm">
            <img src={illumeLogo} alt="Illume" className="h-7 w-auto" />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extralight uppercase tracking-[0.18em] text-foreground sm:text-2xl">
                {title}
              </h1>
              {scopeLabel ? (
                <Badge variant="outline" className="rounded-full border-black/10 bg-white/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  {scopeLabel}
                </Badge>
              ) : null}
            </div>
            {subtitle ? (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <Button
          variant="outline"
          onClick={onSignOut}
          className="h-10 rounded-full border-black/10 bg-white px-5 text-[11px] uppercase tracking-[0.22em]"
        >
          Sign Out
        </Button>
      </div>

      {children}
    </div>
  </div>
);

export const PortalMetricCard = ({
  label,
  value,
  icon,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  hint?: string;
  accent?: string;
}) => (
  <Card className={cn(portalPanelClassName, accent)}>
    <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
      <CardTitle className="text-[11px] font-normal uppercase tracking-[0.28em] text-muted-foreground">
        {label}
      </CardTitle>
      <span className="text-muted-foreground/70">{icon}</span>
    </CardHeader>
    <CardContent className="space-y-1 pt-0">
      <p className="text-3xl font-extralight tracking-tight text-foreground">{value}</p>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </CardContent>
  </Card>
);

export const PortalEmptyState = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <Card className={portalPanelClassName}>
    <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-foreground">{title}</p>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action}
    </CardContent>
  </Card>
);
