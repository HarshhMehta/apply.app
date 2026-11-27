import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./button";
import { Skeleton } from "./skeleton";

export function EmptyState({ icon: Icon, title, description, action }: { icon: React.ComponentType<{ className?: string }>; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-destructive-soft text-destructive">
        <AlertTriangle className="size-5" />
      </div>
      <h3 className="text-[15px] font-semibold">Couldn’t load this</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry && <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function Notice({ tone = "info", title, children, action }: { tone?: "info" | "warning" | "error" | "success"; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const cls = { info: "bg-info-soft text-info", warning: "bg-warning-soft text-warning", error: "bg-destructive-soft text-destructive", success: "bg-success-soft text-success" }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex flex-wrap items-start justify-between gap-3 rounded-panel px-4 py-3 text-sm ${cls}`}>
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
