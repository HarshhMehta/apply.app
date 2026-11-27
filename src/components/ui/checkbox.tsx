import * as React from "react";
import { cn } from "@/lib/utils";

/** Native checkbox styled to the design system (keeps keyboard + screen-reader behaviour for free). */
export function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return <input type="checkbox" className={cn("size-4 cursor-pointer rounded-[4px] border-input accent-[var(--primary)]", className)} {...props} />;
}
