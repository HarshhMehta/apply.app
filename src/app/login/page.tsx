import { Send } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-control bg-primary text-primary-foreground"><Send className="size-4" /></span>
          <span className="text-xl font-semibold tracking-tight">Dispatch</span>
        </div>
        <div className="rounded-panel border bg-card p-6">
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use the administrator account created for this installation.</p>
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">Private application. Accounts are created with <code className="rounded bg-muted px-1 py-0.5">npm run create-admin</code>.</p>
      </div>
    </main>
  );
}
