import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Dispatch", template: "%s · Dispatch" },
  description: "Prepare, review and send job application emails from your own Gmail account.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f4f5f7" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="bottom-right" closeButton toastOptions={{ classNames: { toast: "!rounded-[10px] !border !border-border !shadow-sm" } }} />
      </body>
    </html>
  );
}
