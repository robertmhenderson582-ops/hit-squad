"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { hasBuildDesk, isOwner } from "@/lib/desk-role";
import { VIEW_AS_HIDDEN_SETTINGS } from "@/lib/owner-desk";

const HIDE_WHILE_VIEWING = new Set<string>(VIEW_AS_HIDDEN_SETTINGS);

const SECTIONS: { href: string; label: string; ownerOnly?: boolean; buildDesk?: boolean; exact?: boolean }[] = [
  { href: "/settings", label: "Display", exact: true },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/copy", label: "Copy" },
  { href: "/settings/talk", label: "How we talk" },
  { href: "/settings/users", label: "Manage users", buildDesk: true },
  { href: "/settings/follow", label: "Follow", buildDesk: true },
  { href: "/settings/activity", label: "Activity", buildDesk: true },
  { href: "/settings/view-as", label: "View as", buildDesk: true },
  { href: "/settings/aliases", label: "Aliases", buildDesk: true },
  { href: "/settings/republish", label: "Heads up — republish", buildDesk: true },
  { href: "/settings/vault", label: "Data vault", buildDesk: true },
  { href: "/settings/branding", label: "Branding", buildDesk: true },
  { href: "/settings/checks", label: "Checks", ownerOnly: true },
  { href: "/settings/modules", label: "Future modules" },
];

function active(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  const desk = useOwnerDesk();
  const owner = isOwner(user);
  const buildDesk = hasBuildDesk(user);
  const viewingAs = Boolean(desk?.viewAs && desk.viewAs !== "owner");

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="plant-card h-fit px-3 py-4">
        <p className="px-2 text-xs tracking-[0.18em] text-[#5b6f73]">SETTINGS</p>
        <nav className="mt-3 flex flex-col gap-1">
          {SECTIONS.filter((item) => {
            if (item.ownerOnly && !owner) return false;
            if (item.buildDesk && !buildDesk) return false;
            if (viewingAs && HIDE_WHILE_VIEWING.has(item.href)) return false;
            return true;
          }).map((item) => {
            const on = active(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`settings-rail rounded-lg px-3 py-2 text-sm ${on ? "settings-rail-on" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div>{children}</div>
    </div>
  );
}
