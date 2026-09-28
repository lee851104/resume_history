import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "投遞日誌｜履歷追蹤",
  description: "記錄每次投遞，掌握下一步。私人履歷與求職進度儀表板。",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
