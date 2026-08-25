"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FieldTrialBanner } from "@/components/FieldTrialBanner";
import { Wordmark } from "@/components/Wordmark";
import { useSession } from "@/components/SessionProvider";

const NAV = [
  { href: "/jobs", label: "Jobs" },
  { href: "/estimates", label: "Estimates" },
  { href: "/cost", label: "Cost" },
  { href: "/hse", label: "HSE" },
  { href: "/sites", label: "Sites" },
  { href: "/change-orders", label: "Change orders" },
  { href: "/quality", label: "Quality" },
  { href: "/rates", label: "Rates" },
];

function navActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DeskChrome({
  children,
  title,
  kicker = "FORGEBOOK",
}: {
  children: React.ReactNode;
  title: string;
  kicker?: string;
}) {
  const pathname = usePathname();
  const { user, signOut } = useSession();

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
              <Link
                href="/estimates/new"
                className="bg-amber-flare px-4 py-2 font-display text-sm tracking-[0.18em] text-ink"
              >
                NEW ESTIMATE
              </Link>
              <div className="text-right">
                <p className="font-mono text-[10px] tracking-[0.24em] text-steel-glow">OWNER DESK</p>
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
          <nav className="mt-4 flex flex-wrap gap-2 font-mono text-[11px] tracking-[0.16em]">
            {NAV.map((item) => {
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
          <p className="font-mono text-[10px] tracking-[0.32em] text-amber-label">{kicker}</p>
          <h1 className="mt-1 font-display text-3xl tracking-[0.12em] text-paper-cream">{title}</h1>
          {children}
        </main>
      </div>
    </div>
  );
}
