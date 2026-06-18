import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Overlays from "@/app/components/Overlays";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F7F6F3] text-[#111111]">{children}<Overlays /></body>
    </html>
  );
}
