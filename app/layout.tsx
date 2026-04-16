import type { Metadata } from "next";
import "./globals.css";
import PersistentChatBot from "@/components/PersistentChatBot";

export const metadata: Metadata = {
  title: "K-stat 글로벌 무역통계",
  description: "한국무역협회 K-stat 무역통계 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
        <div className="app-shell">
          <div className="app-main">
            {children}
          </div>
          <PersistentChatBot />
        </div>
      </body>
    </html>
  );
}
