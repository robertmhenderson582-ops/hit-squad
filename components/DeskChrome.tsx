"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDisplay } from "@/components/DisplayProvider";
import { DeskBanners } from "@/components/DeskBanners";
import { EstimateModalProvider, useEstimateModal } from "@/components/EstimateModalContext";
import { FieldTrialBanner } from "@/components/FieldTrialBanner";
import { BrandMark } from "@/components/BrandMark";
import { Wordmark } from "@/components/Wordmark";
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

function ThemeFlip() {
  const { resolvedTheme, flipDayNight } = useDisplay();
  return (
    <button
      type="button"
      onClick={flipDayNight}
      className="theme-flip"
      aria-label={resolvedTheme === "day" ? "Night" : "Day"}
      title={resolvedTheme === "day" ? "Night — lights-out trailer" : "Day — paper desk"}
    >
      {resolvedTheme === "day" ? "☾" : "☀"}
    </button>
  );
}

function ChromeInner({
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
  const pathname = usePathname();
  const { user, signOut } = useSession();
  const { openNewEstimate } = useEstimateModal();
  const { resolvedTheme } = useDisplay();
  const paper = resolvedTheme === "day" || variant === "paper";

  return (
    <div className={paper && resolvedTheme === "day" ? "paper-page" : variant === "hero" && resolvedTheme === "night" ? "industrial-root" : "paper-page"}>
      <FieldTrialBanner />
      <div className={`relative z-10 mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6`}>
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
                  onClick={() => signOut()}
                  className="mt-1 font-mono text-[10px] tracking-[0.2em] text-amber-label underline underline-offset-4"
                >
                  SIGN OUT
                </button>
              </div>
            </div>
          </div>
          <nav className="mt-4 flex flex-wrap gap-2 font-mono text-[11px] tracking-[0.16em]">
            {NAV.map((item) => {
              const active = navActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    paper
                      ? `rounded px-3 py-2 ${active ? "paper-rail-active" : "paper-rail"}`
                      : `border px-3 py-2 ${
                          active
                            ? "border-amber-label bg-ink/50 text-amber-label"
                            : "border-steel-rim/40 bg-steel-plate/80 text-paper-cream/90 hover:border-steel-glow"
                        }`
                  }
                >
                  {item.label.toUpperCase()}
                </Link>
              );
            })}
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
