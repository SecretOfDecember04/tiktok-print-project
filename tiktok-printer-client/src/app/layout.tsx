import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TikTok Print Dashboard",
  description: "Login & manage your TikTok shop printer.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      {/* tik-app: 应用五彩斑斓黑主题背景与 TikTok Sans；antialiased: 抗锯齿 */}
      <body className="tik-app antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}