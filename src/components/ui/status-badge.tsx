import { cn } from "@/lib/utils";
import { STATUS_LABELS, type Status } from "@/lib/constants";

const tone: Record<Status, string> = {
  draft: "bg-muted text-muted-foreground [--dot:#8794a6]",
  pending_review: "bg-warning-soft text-warning [--dot:#c47a0a]",
  approved: "bg-info-soft text-info [--dot:#3f4fb5]",
  sending: "bg-primary-soft text-primary [--dot:#0b6e69]",
  sent: "bg-success-soft text-success [--dot:#1d7a46]",
  failed: "bg-destructive-soft text-destructive [--dot:#b3261e]",
  rejected: "bg-muted text-muted-foreground [--dot:#b3261e]",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", tone[status], className)}>
      <span className={cn("size-1.5 rounded-full bg-[var(--dot)]", status === "sending" && "animate-pulse")} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground", className)}>{children}</span>;
}
