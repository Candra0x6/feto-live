import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Feto Live — Micro-Event Prediction Markets",
  description:
    "Bet on real-time micro-events during World Cup 2026 matches. Powered by Solana.",
  openGraph: {
    title: "Feto Live",
    description: "Real-time micro-event prediction markets on Solana",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
