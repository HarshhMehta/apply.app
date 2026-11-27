import * as React from "react";
import { Label } from "./label";
import { cn } from "@/lib/utils";

/** Label + control + hint/error, wired for accessibility. */
export function Field({ id, label, hint, error, optional, children, className }: { id: string; label: string; hint?: string; error?: string; optional?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted-foreground">Optional</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-destructive">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
