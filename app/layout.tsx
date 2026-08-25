import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Rajdhani } from "next/font/google";
import { ConfirmDialogProvider } from "@/components/ConfirmDialog";
import { DeskFabs } from "@/components/DeskFabs";
import { DisplayProvider } from "@/components/DisplayProvider";
import { InboxProvider } from "@/components/InboxProvider";
import { InactivityLock } from "@/components/InactivityLock";
import { OwnerDeskProvider } from "@/components/OwnerDeskContext";
import { SessionProvider } from "@/components/SessionProvider";
import { SignedInToast } from "@/components/SignedInToast";
import { TalkWalkProvider } from "@/components/TalkWalk";
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
    title: "HIT SQUAD PROJECT CONTROLS",
    description: "Field trial — not a release.",
    images: [{ url: "/brand-hero.jpg", width: 1536, height: 840, alt: "HIT SQUAD PROJECT CONTROLS" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className={`${sans.className}`}>
        <SessionProvider>
          <DisplayProvider>
            <OwnerDeskProvider>
              <InboxProvider>
                <ConfirmDialogProvider>
                  <TalkWalkProvider>
                    {children}
                    <InactivityLock />
                    <DeskFabs />
                    <SignedInToast />
                  </TalkWalkProvider>
                </ConfirmDialogProvider>
              </InboxProvider>
            </OwnerDeskProvider>
          </DisplayProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
