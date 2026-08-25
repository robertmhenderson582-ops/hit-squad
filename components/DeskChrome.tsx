"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { Capabilities, DeskCapability } from "@/lib/access";
import { capabilitiesFor, hasCapability } from "@/lib/access";
import { FieldTrialBanner } from "@/components/FieldTrialBanner";
import { Wordmark } from "@/components/Wordmark";
import { useSession } from "@/components/SessionProvider";

const NAV: { href: string; label: string; need: DeskCapability }[] = [
  { href: "/jobs", label: "Jobs", need: "jobs" },
  { href: "/estimates", label: "Estimates", need: "estimates" },
  { href: "/cost", label: "Cost / PPR", need: "cost" },
  { href: "/hse", label: "HSE", need: "hse" },
  { href: "/sites", label: "Sites", need: "sites" },
  { href: "/change-orders", label: "Change orders", need: "changeOrders" },
  { href: "/quality", label: "Quality / ITP", need: "quality" },
  { href: "/rates", label: "Rates", need: "rates" },
  { href: "/tickets", label: "Tickets", need: "tickets" },
  { href: "/follow", label: "Follow", need: "follow" },
  { href: "/activity", label: "Activity", need: "activity" },
  { href: "/republish", label: "Republish", need: "republish" },
  { href: "/users", label: "Users", need: "users" },
];

function navActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DeskChrome({
  children,
  title,
  kicker = "FORGEBOOK",
  hideTitle = false,
}: {
  children: React.ReactNode;
  title: string;
  kicker?: string;
  hideTitle?: boolean;
}) {
  const pathname = usePathname();
  const { user, signOut } = useSession();
  const [viewAs, setViewAs] = useState<"seat" | "staff" | "hse" | "quality">("seat");

  const can: Capabilities | undefined = useMemo(() => {
    if (!user) return undefined;
    if (user.role === "owner") return user.can;
    if (!user.can.viewAs || viewAs === "seat") return user.can;
    if (viewAs === "staff") return capabilitiesFor("Staff/numbers");
    if (viewAs === "hse") return capabilitiesFor("Trusted/HSE");
    return capabilitiesFor("Trusted/Quality");
  }, [user, viewAs]);

  return (
    <div className="industrial-root">
      <FieldTrialBanner />
      <div className="relative z-10 mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
        <header className="steel-plate paper-grain px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/" className="min-w-0">
              <Wordmark compact />
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              {hasCapability(user, "estimates") ? (
                <Link
                  href="/estimates/new"
                  className="bg-amber-flare px-4 py-2 font-display text-sm tracking-[0.18em] text-ink"
                >
                  NEW ESTIMATE
                </Link>
              ) : null}
              <div className="text-right">
                <p className="font-mono text-[10px] tracking-[0.24em] text-steel-glow">
                  {user?.role === "owner" ? "OWNER DESK" : user?.permission.toUpperCase()}
                </p>
                <p className="font-display text-lg tracking-wide text-paper-cream sm:text-xl">{user?.name}</p>
                <p className="font-mono text-[11px] text-paper-cream/70">{user?.email}</p>
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
          {hasCapability(user, "viewAs") ? (
            <label className="mt-3 block text-sm text-paper-cream/80">
              View as{" "}
              <select
                value={viewAs}
                onChange={(event) => setViewAs(event.target.value as typeof viewAs)}
                className="ml-2 border border-steel-rim/40 bg-ink/70 px-2 py-1 text-paper-cream"
              >
                <option value="seat">My seat</option>
                <option value="staff">Staff / numbers</option>
                <option value="hse">Trusted / HSE</option>
                <option value="quality">Trusted / Quality</option>
              </select>
            </label>
          ) : null}
          <nav className="mt-4 flex flex-wrap gap-2 font-mono text-[11px] tracking-[0.16em]">
            {NAV.filter((item) => hasCapability({ role: user?.role ?? "tester", can }, item.need)).map((item) => {
              const active = navActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`border px-3 py-2 ${
                    active
                      ? "border-amber-label bg-ink/50 text-amber-label"
                      : "border-steel-rim/40 bg-steel-plate/80 text-paper-cream/90 hover:border-steel-glow"
                  }`}
                >
                  {item.label.toUpperCase()}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mt-5">
          {hideTitle ? null : (
            <>
              <p className="font-mono text-[10px] tracking-[0.32em] text-amber-label">{kicker}</p>
              <h1 className="mt-1 font-display text-3xl tracking-[0.12em] text-paper-cream">{title}</h1>
            </>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
