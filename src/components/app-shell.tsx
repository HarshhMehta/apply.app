"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FilePlus2, History, LayoutDashboard, ListChecks, LogOut, Mail, Menu, Send, Settings, FileText, FileStack } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/applications/new", label: "New application", icon: FilePlus2 },
  { href: "/review", label: "Review queue", icon: ListChecks, badge: true },
  { href: "/history", label: "Application history", icon: History },
  { href: "/templates", label: "Email templates", icon: FileText },
  { href: "/resumes", label: "Resume manager", icon: FileStack },
  { href: "/gmail", label: "Gmail integration", icon: Mail },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-1">
      <span className="grid size-8 place-items-center rounded-control bg-primary text-primary-foreground"><Send className="size-4" /></span>
      <span className="text-[17px] font-semibold tracking-tight">Dispatch</span>
    </Link>
  );
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { data } = useFetch<{ statusCounts: Record<string, number> }>(`/api/queue?status=pending_review&pageSize=1&n=${encodeURIComponent(pathname)}`);
  const pending = data?.statusCounts?.pending_review ?? 0;
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon, ...rest }) => {
        const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`)) || (href === "/applications/new" && pathname.startsWith("/applications"));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
              active && "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary",
            )}
          >
            {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" aria-hidden />}
            <Icon className="size-[18px]" />
            <span className="flex-1">{label}</span>
            {"badge" in rest && pending > 0 && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">{pending}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ user }: { user: { email: string; name?: string } }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="border-t pt-3">
      <p className="truncate px-2 text-[13px] font-medium">{user.name || "Signed in"}</p>
      <p className="truncate px-2 text-xs text-muted-foreground">{user.email}</p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 w-full justify-start text-muted-foreground"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
          router.replace("/login");
        }}
      >
        <LogOut /> Sign out
      </Button>
    </div>
  );
}

export function AppShell({ user, children }: { user: { email: string; name?: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-card p-4 lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto"><NavList pathname={pathname} /></div>
        <SidebarFooter user={user} />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-card/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <Brand />
          <Button variant="outline" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}><Menu /></Button>
        </header>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent hideClose className="left-0 top-0 h-dvh max-h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 gap-6 rounded-none p-4">
            <DialogTitle className="sr-only">Navigation</DialogTitle>
            <DialogDescription className="sr-only">Main navigation</DialogDescription>
            <Brand />
            <div className="flex-1 overflow-y-auto"><NavList pathname={pathname} onNavigate={() => setOpen(false)} /></div>
            <SidebarFooter user={user} />
          </DialogContent>
        </Dialog>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
