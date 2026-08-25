import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Rajdhani } from "next/font/google";
import { ConfirmDialogProvider } from "@/components/ConfirmDialog";
import { DisplayProvider } from "@/components/DisplayProvider";
import { InactivityLock } from "@/components/InactivityLock";
import { SessionProvider } from "@/components/SessionProvider";
import "./globals.css";

const display = Rajdhani({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Hit Squad Project Controls",
  description: "Private invite-only industrial outage / T&M estimating desk. Field trial — not a release.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "HIT SQUAD ESTIMATORS",
    description: "Estimate & Cost · Field trial — not a release.",
    images: [{ url: "/brand-hero.jpg", width: 1200, height: 630, alt: "HIT SQUAD ESTIMATORS — ESTIMATE & COST" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className={`${sans.className}`}>
        <SessionProvider>
          <DisplayProvider>
            <ConfirmDialogProvider>
              {children}
              <InactivityLock />
            </ConfirmDialogProvider>
          </DisplayProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
