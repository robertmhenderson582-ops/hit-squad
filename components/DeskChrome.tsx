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
import { canOpenRates, isOperator, isPresident, isTester } from "@/lib/desk-role";
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

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const rail = (active: boolean) =>
    paper ? `rounded px-3 py-2 ${active ? "paper-rail-active" : "paper-rail"}` : `hud-rail px-3 py-2 ${active ? "hud-rail-active" : ""}`;

  const deskLabel = isTester(lens)
    ? "DESK"
    : isPresident(user)
      ? "PRESIDENT DESK"
      : isOperator(user)
        ? "OPERATOR DESK"
        : "OWNER DESK";
  const displayName = lens?.name || user?.name;
  const displayEmail = lens?.email || user?.email;
  const navItems = NAV.filter((item) => item.href !== "/rates" || canOpenRates(lens));
  const links = navItems.map((item) => {
    const active = navActive(pathname, item.href, item.modules);
    return (
      <Link key={item.href} href={item.href} className={rail(active)} title={item.label} aria-label={item.label}>
        {item.label.toUpperCase()}
      </Link>
    );
  });

  function signOutNow() {
    noteSessionEnd("sign-out", pathname);
    void signOut();
  }

  const pageBody = (
    <>
      <DeskBanners />
      {MODULE_HREFS.includes(pathname) || pathname === "/settings/modules" ? <UnderConstructionBanner /> : null}
      {hideTitle ? null : (
        <>
          <p className={`font-mono text-[10px] tracking-[0.32em] ${paper ? "text-steel" : "text-amber-label"}`}>
            {kicker}
          </p>
          <h1 className={`mt-1 font-display text-3xl tracking-[0.12em] ${paper ? "text-[#163038]" : "text-paper-cream"}`}>
            {title}
          </h1>
        </>
      )}
      {children}
    </>
  );

  return (
    <div
      className={hero ? "desk-home-root" : paper ? "paper-page" : "industrial-root"}
      data-capture-root
      data-desk-chrome={hero ? "hero" : "paper"}
    >
      <FieldTrialBanner />
      {hero ? (
        <>
          <div className="home-corner-chrome">
            <header className="home-title-card">
              <Link href="/" className="home-title-brand brand-static" title="Home" aria-label="Home">
                <BrandMark className="home-title-mark" />
                <span className="home-title-copy">
                  <span className="home-title-word">HIT SQUAD</span>
                  <span className="home-title-kicker">PROJECT CONTROLS</span>
                </span>
              </Link>
              <nav className="home-title-actions" aria-label="Home">
                <Link href="/" className="home-corner-home brand-static" title="Home" aria-label="Home">
                  <HomeCue />
                </Link>
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href} className="home-corner-settings" title={item.label} aria-label={item.label}>
                    {item.href === "/settings" ? <SettingsGlyph /> : null}
                    {item.label.toUpperCase()}
                  </Link>
                ))}
              </nav>
            </header>
            <aside className="home-owner-card" aria-label={deskLabel}>
              <p className="home-owner-kicker">
                <OwnerGlyph />
                {deskLabel}
              </p>
              <p className="home-owner-name">{displayName}</p>
              <p className="home-owner-email">{displayEmail}</p>
              <button type="button" onClick={signOutNow} className="home-owner-signout">
                <SignOutGlyph />
                SIGN OUT
              </button>
            </aside>
          </div>
          <main className="desk-home-main">{pageBody}</main>
        </>
      ) : (
        <div className="relative z-10 mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
          <header className={paper ? "paper-header rounded-xl px-4 py-4 sm:px-5" : "hud-bezel steel-plate px-4 py-4 sm:px-5"}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Link href="/" className="brand-static header-home min-w-0" title="Home" aria-label="Home">
                {paper ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <BrandMark className="h-8 w-8 shrink-0" />
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
                    {deskLabel}
                  </p>
                  <p className={`font-display text-lg tracking-wide sm:text-xl ${paper ? "text-white" : "text-paper-cream"}`}>
                    {displayName}
                  </p>
                  <p className={`font-mono text-[11px] ${paper ? "text-white/70" : "text-paper-cream/70"}`}>
                    {displayEmail}
                  </p>
                  <button
                    type="button"
                    onClick={signOutNow}
                    className="mt-1 font-mono text-[10px] tracking-[0.2em] text-amber-label underline underline-offset-4"
                  >
                    SIGN OUT
                  </button>
                </div>
              </div>
            </div>
            <nav className="mt-4 font-mono text-[11px] tracking-[0.16em]">
              {links.length > 1 ? (
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
              ) : null}
              <div
                id="desk-nav"
                className={`${links.length > 1 && !menuOpen ? "hidden sm:flex" : "flex"} mt-2 flex-col gap-2 sm:mt-0 sm:flex-row sm:flex-wrap`}
              >
                {links}
              </div>
            </nav>
          </header>
          <main className="mt-5">{pageBody}</main>
        </div>
      )}
      <NewEstimateHost />
    </div>
  );
}

function SettingsGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <circle cx="8" cy="8" r="2.15" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.7v1.7M8 12.6v1.7M1.7 8h1.7M12.6 8h1.7M3.35 3.35l1.2 1.2M11.45 11.45l1.2 1.2M3.35 12.65l1.2-1.2M11.45 4.55l1.2-1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function OwnerGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <circle cx="8" cy="5.2" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.2 13.2c.6-2.6 2.3-3.8 4.8-3.8s4.2 1.2 4.8 3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function SignOutGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M6.2 3.2H3.6v9.6h2.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M7.2 8h5.4M10.4 5.6 13 8l-2.6 2.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
