import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MiniMax Chat",
  description:
    "Chat con MiniMax M3, MCPs y el mismo rigor de comportamiento que opencode",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body className="bg-bg text-fg min-h-screen" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
