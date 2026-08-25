"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useDisplay } from "@/components/DisplayProvider";
import { DeskBanners } from "@/components/DeskBanners";
import { EstimateModalProvider, useEstimateModal } from "@/components/EstimateModalContext";
import { FieldTrialBanner } from "@/components/FieldTrialBanner";
import { BrandMark } from "@/components/BrandMark";
import { ThemeFlip } from "@/components/ThemeFlip";
import { InboxBadge } from "@/components/InboxBadge";
import { Wordmark } from "@/components/Wordmark";
import { noteSessionEnd } from "@/components/FeatureTrail";
import { useSession } from "@/components/SessionProvider";

const NAV: { href: string; label: string }[] = [
  { href: "/jobs", label: "Jobs" },
  { href: "/sites", label: "Sites" },
  { href: "/estimates", label: "Estimates" },
  { href: "/change-orders", label: "Change orders" },
  { href: "/hse", label: "HSE" },
  { href: "/quality", label: "Quality" },
  { href: "/rates", label: "Rates" },
  { href: "/cost", label: "Cost / PPR" },
  { href: "/settings", label: "Settings" },
];

function navActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ChromeInner({
  children,
  title,
  kicker = "PROJECT CONTROLS",
  hideTitle = false,
}: {
  children: React.ReactNode;
  title: string;
  kicker?: string;
  hideTitle?: boolean;
  variant?: "paper" | "hero";
}) {
  const pathname = usePathname();
  const { user, signOut } = useSession();
  const { openNewEstimate } = useEstimateModal();
  const { resolvedTheme } = useDisplay();
  const paper = resolvedTheme === "day";
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const links = NAV.map((item) => {
    const active = navActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={
          paper
            ? `rounded px-3 py-2 ${active ? "paper-rail-active" : "paper-rail"}`
            : `hud-rail px-3 py-2 ${active ? "hud-rail-active" : ""}`
        }
      >
        {item.label.toUpperCase()}
      </Link>
    );
  });

  return (
    <div className={paper ? "paper-page" : "industrial-root"}>
      <FieldTrialBanner />
      <div className="relative z-10 mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
        <header className={paper ? "paper-header rounded-xl px-4 py-4 sm:px-5" : "hud-bezel steel-plate px-4 py-4 sm:px-5"}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/" className="brand-static min-w-0">
              {paper ? (
                <span className="flex items-center gap-2">
                  <BrandMark variant="stacked" className="h-8 w-6" />
                  <span className="leading-none">
                    <span className="block font-display text-2xl tracking-[0.14em] text-white">HIT SQUAD</span>
                    <span className="mt-0.5 block font-display text-[11px] tracking-[0.22em] text-white/80">
                      PROJECT CONTROLS
                    </span>
                  </span>
                </span>
              ) : (
                <Wordmark compact />
              )}
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <InboxBadge />
              <ThemeFlip />
              <button
                type="button"
                onClick={() => openNewEstimate()}
                className={
                  paper
                    ? "rounded-lg bg-white px-4 py-2 font-display text-sm tracking-[0.14em] text-steel"
                    : "bg-amber-flare px-4 py-2 font-display text-sm tracking-[0.18em] text-ink"
                }
              >
                NEW ESTIMATE
              </button>
              <div className="text-right">
                <p className={`font-mono text-[10px] tracking-[0.24em] ${paper ? "text-white/70" : "text-steel-glow"}`}>
                  OWNER DESK
                </p>
                <p className={`font-display text-lg tracking-wide sm:text-xl ${paper ? "text-white" : "text-paper-cream"}`}>
                  {user?.name}
                </p>
                <p className={`font-mono text-[11px] ${paper ? "text-white/70" : "text-paper-cream/70"}`}>{user?.email}</p>
                <button
                  type="button"
                  onClick={() => {
                    noteSessionEnd("sign-out", pathname);
                    void signOut();
                  }}
                  className="mt-1 font-mono text-[10px] tracking-[0.2em] text-amber-label underline underline-offset-4"
                >
                  SIGN OUT
                </button>
              </div>
            </div>
          </div>
          <nav className="mt-4 font-mono text-[11px] tracking-[0.16em]">
            <button
              type="button"
              className={`desk-nav-toggle sm:hidden ${paper ? "paper-rail" : "hud-rail"}`}
              aria-expanded={menuOpen}
              aria-controls="desk-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="desk-nav-burger" aria-hidden="true" />
              {menuOpen ? "CLOSE" : "MENU"}
            </button>
            <div
              id="desk-nav"
              className={`${menuOpen ? "flex" : "hidden"} mt-2 flex-col gap-2 sm:mt-0 sm:flex sm:flex-row sm:flex-wrap`}
            >
              {links}
            </div>
          </nav>
        </header>

        <main className="mt-5">
          <DeskBanners />
          {hideTitle ? null : (
            <>
              <p className={`font-mono text-[10px] tracking-[0.32em] ${paper ? "text-steel" : "text-amber-label"}`}>
                {kicker}
              </p>
              <h1
                className={`mt-1 font-display text-3xl tracking-[0.12em] ${paper ? "text-[#163038]" : "text-paper-cream"}`}
              >
                {title}
              </h1>
            </>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

export function DeskChrome({
  children,
  title,
  kicker = "PROJECT CONTROLS",
  hideTitle = false,
  variant = "paper",
}: {
  children: React.ReactNode;
  title: string;
  kicker?: string;
  hideTitle?: boolean;
  variant?: "paper" | "hero";
}) {
  return (
    <EstimateModalProvider>
      <ChromeInner title={title} kicker={kicker} hideTitle={hideTitle} variant={variant}>
        {children}
      </ChromeInner>
    </EstimateModalProvider>
  );
}
