import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "芭乐AIGC",
  description: "面向电商团队的一站式商品视觉创作平台",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "256x256" },
      { url: "/brand/bala-aigc-mark.png", type: "image/png", sizes: "720x720" },
    ],
    apple: [
      { url: "/brand/bala-aigc-mark.png", type: "image/png", sizes: "720x720" },
    ],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
