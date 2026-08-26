"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { hasBuildDesk } from "@/lib/desk-role";
import { isDeskLocked } from "@/lib/desk-lock";

type Arrival = { name: string; path: string };

function landLabel(path: string) {
  if (path.startsWith("/jobs/")) return path.replace("/jobs/", "Jobs · ");
  if (path === "/") return "Home";
  return path.replace(/^\//, "") || "Home";
}

export function SignedInToast() {
  const { user, status } = useSession();
  const owner = useOwnerDesk();
  const pathname = usePathname();
  const [arrival, setArrival] = useState<Arrival | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    function beat() {
      if (isDeskLocked()) return;
      fetch("/api/desk/presence", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathname }),
      }).catch(() => undefined);
    }
    beat();
    const id = window.setInterval(beat, 20_000);
    return () => window.clearInterval(id);
  }, [pathname, status, user]);

  useEffect(() => {
    if (status !== "authenticated" || !hasBuildDesk(user)) return;
    if (owner?.viewAs && owner.viewAs !== "owner") return;
    if (owner?.followSeat && owner.followSeat !== "owner") return;
    const tick = window.setInterval(() => {
      fetch("/api/desk/presence", { credentials: "include", cache: "no-store" })
        .then((response) => response.json())
        .then((data) => {
          const next = (data.arrivals as Arrival[] | undefined)?.[0];
          if (next) setArrival(next);
        })
        .catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(tick);
  }, [owner?.followSeat, owner?.viewAs, status, user]);

  useEffect(() => {
    if (!arrival) return;
    const id = window.setTimeout(() => setArrival(null), 5600);
    return () => window.clearTimeout(id);
  }, [arrival]);

  if (!hasBuildDesk(user)) return null;
  if (owner?.viewAs && owner.viewAs !== "owner") return null;
  if (owner?.followSeat && owner.followSeat !== "owner") return null;
  if (!arrival) return null;

  return (
    <aside className="signedin-pop">
      <p className="text-xs tracking-[0.16em] text-white/70">SIGNED IN</p>
      <p className="mt-1 font-semibold text-white">{arrival.name}</p>
      <p className="text-sm text-white/80">Landed {landLabel(arrival.path)}</p>
      <Link href="/settings/follow" className="mt-2 inline-block text-sm text-[#f0a13a] underline">
        Follow
      </Link>
    </aside>
  );
}
