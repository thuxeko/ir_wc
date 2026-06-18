import type { Metadata } from "next";
import Overlays from "@/app/components/Overlays";
import "./globals.css";

export const metadata: Metadata = {
  title: "WC26 Predict • Dự đoán World Cup 2026 (Nội bộ)",
  description: "Dự đoán tỷ số World Cup 2026 - Công cụ nội bộ",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#F7F6F3] text-[#111111]">{children}<Overlays /></body>
    </html>
  );
}
