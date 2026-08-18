import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "siege — M0",
  description: "Tower defense prototype. Does a four-minute run make you want a second one?",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0d1117",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-full bg-[#0d1117] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
