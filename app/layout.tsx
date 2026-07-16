import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "潮汐创作台",
  description: "面向电商团队的 AI 商品视觉创作平台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
