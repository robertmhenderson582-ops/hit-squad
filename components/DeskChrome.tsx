"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useDisplay } from "@/components/DisplayProvider";
import { DeskBanners } from "@/components/DeskBanners";
import { EstimateModalProvider, NewEstimateHost } from "@/components/EstimateModalContext";
import { UnderConstructionBanner } from "@/components/UnderConstructionBanner";
import { FieldTrialBanner } from "@/components/FieldTrialBanner";
import { BrandMark } from "@/components/BrandMark";
import { HomeCue } from "@/components/HomeCue";
import { ThemeFlip } from "@/components/ThemeFlip";
import { Wordmark } from "@/components/Wordmark";
import { noteSessionEnd } from "@/components/FeatureTrail";
import { FUTURE_MODULES } from "@/components/FutureModulesDesk";
import { useLensUser } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { canOpenRates, isOperator, isTester } from "@/lib/desk-role";
import { DESK_NAV } from "@/lib/desk-nav";

const NAV = DESK_NAV;

const MODULE_HREFS = ["/modules", ...FUTURE_MODULES.map((item) => item.href)];

function navActive(pathname: string, href: string, modules?: boolean) {
  if (modules) return MODULE_HREFS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  return pathname === href || pathname.startsWith(`${href}/`);
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
  const lens = useLensUser();
  const { resolvedTheme } = useDisplay();
  const paper = resolvedTheme === "day";
  const hero = variant === "hero";
  const [menuOpen, setMenuOpen] = useState(false);
  const [modsOpen, setModsOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    setModsOpen(false);
  }, [pathname]);

  const rail = (active: boolean) =>
    paper ? `rounded px-3 py-2 ${active ? "paper-rail-active" : "paper-rail"}` : `hud-rail px-3 py-2 ${active ? "hud-rail-active" : ""}`;

  const links = NAV.filter((item) => item.href !== "/rates" || canOpenRates(lens)).map((item) => {
    const active = navActive(pathname, item.href, item.modules);
    if (item.modules) {
      return (
        <div key={item.href} className="future-mods relative">
          <button
            type="button"
            className={`${rail(active)} flex items-center gap-1`}
            aria-expanded={modsOpen}
            aria-haspopup="true"
            onClick={() => setModsOpen((open) => !open)}
          >
            {item.label.toUpperCase()}
            <span aria-hidden="true">{modsOpen ? "▴" : "▾"}</span>
          </button>
          {modsOpen ? (
            <div className="future-mods-menu" role="menu">
              <Link href={item.href} className="future-mods-item" role="menuitem">
                All modules
              </Link>
              {FUTURE_MODULES.map((mod) => (
                <Link key={mod.href} href={mod.href} className="future-mods-item" role="menuitem">
                  <span>{mod.name}</span>
                  <span className="future-mods-note">{mod.note}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      );
    }
    return (
      <Link key={item.href} href={item.href} className={rail(active)}>
        {item.label.toUpperCase()}
      </Link>
    );
  });

  return (
    <div
      className={hero ? "desk-home-root" : paper ? "paper-page" : "industrial-root"}
      data-capture-root
      data-desk-chrome={hero ? "hero" : "paper"}
    >
      <FieldTrialBanner />
      <div className={`relative z-10 mx-auto max-w-6xl px-3 ${hero ? "py-3 sm:px-4 sm:py-4" : "py-4 sm:px-4 sm:py-6"}`}>
        <header className={paper ? "paper-header rounded-xl px-4 py-4 sm:px-5" : "hud-bezel steel-plate px-4 py-4 sm:px-5"}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/" className="brand-static header-home min-w-0" title="Home" aria-label="Home">
              {paper ? (
                <span className="flex min-w-0 items-center gap-2">
                  <BrandMark variant="stacked" className="h-8 w-8 shrink-0" />
                  <span className="min-w-0 leading-none">
                    <span className="block font-display text-2xl tracking-[0.14em] text-white">HIT SQUAD</span>
                    <span className="mt-0.5 block font-display text-[11px] tracking-[0.22em] text-white/80">
                      PROJECT CONTROLS
                    </span>
                    <HomeCue />
                  </span>
                </span>
              ) : (
                <Wordmark compact homeCue />
              )}
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <ThemeFlip />
              <div className="text-right">
                <p className={`font-mono text-[10px] tracking-[0.24em] ${paper ? "text-white/70" : "text-steel-glow"}`}>
                  {isTester(lens) ? "DESK" : isOperator(user) ? "OPERATOR DESK" : "OWNER DESK"}
                </p>
                <p className={`font-display text-lg tracking-wide sm:text-xl ${paper ? "text-white" : "text-paper-cream"}`}>
                  {lens?.name || user?.name}
                </p>
                <p className={`font-mono text-[11px] ${paper ? "text-white/70" : "text-paper-cream/70"}`}>
                  {lens?.email || user?.email}
                </p>
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

        <main className={hero ? "desk-home-main" : "mt-5"}>
          <DeskBanners />
          {MODULE_HREFS.includes(pathname) || pathname === "/settings/modules" ? <UnderConstructionBanner /> : null}
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
      <NewEstimateHost />
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
