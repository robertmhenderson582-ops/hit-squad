"use client";

import Link from "next/link";
import { FieldTrialBanner } from "@/components/FieldTrialBanner";
import { Wordmark } from "@/components/Wordmark";
import { useSession } from "@/components/SessionProvider";

const NAV = [
  { href: "/", label: "Desk" },
  { href: "/jobs", label: "Jobs" },
  { href: "/estimates", label: "Estimates" },
  { href: "/cost", label: "Cost" },
  { href: "/hse", label: "HSE" },
];

export function DeskChrome({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const { user, signOut } = useSession();

  return (
    <div className="industrial-root">
      <div className="plant-silhouette" />
      <FieldTrialBanner />
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6">
        <header className="steel-plate paper-grain flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <Wordmark compact />
          <div className="text-right">
            <p className="font-mono text-[10px] tracking-[0.24em] text-steel-glow">OWNER DESK</p>
            <p className="font-display text-xl tracking-wide text-paper-cream">{user?.name}</p>
            <p className="font-mono text-xs text-paper-cream/70">{user?.email}</p>
            <button
              type="button"
              onClick={() => signOut()}
              className="mt-2 font-mono text-[10px] tracking-[0.2em] text-amber-label underline underline-offset-4"
            >
              SIGN OUT
            </button>
          </div>
        </header>

        <nav className="mt-4 flex flex-wrap gap-2 font-mono text-[11px] tracking-[0.2em]">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="border border-steel-rim/40 bg-steel-plate/80 px-3 py-2 text-paper-cream/90 hover:border-steel-glow"
            >
              {item.label.toUpperCase()}
            </Link>
          ))}
        </nav>

        <main className="mt-6">
          <p className="font-mono text-[10px] tracking-[0.32em] text-amber-label">FORGEBOOK</p>
          <h1 className="mt-1 font-display text-3xl tracking-[0.12em] text-paper-cream">{title}</h1>
          {children}
        </main>
      </div>
    </div>
  );
}
