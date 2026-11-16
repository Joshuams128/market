import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DayTrade OS — signals, sizing, backtests",
  description: "Rule-based intraday signals for US stocks and gold with risk sizing and a backtester.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
