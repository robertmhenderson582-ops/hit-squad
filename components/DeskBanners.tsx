"use client";

import { useEffect, useState } from "react";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { hasBuildDesk } from "@/lib/desk-role";
import { seatLabel } from "@/lib/owner-desk";

export function DeskBanners() {
  const owner = useOwnerDesk();
  const { user } = useSession();
  const [now, setNow] = useState(Date.now());
  const pub = owner?.republish;
  const buildDesk = hasBuildDesk(user);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <>
      {pub?.active ? <RepublishBanner now={now} /> : null}
      {buildDesk && owner && owner.followSeat !== "owner" ? (
        <div className="follow-banner mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm">
            Following {seatLabel(owner.followSeat, owner.people)}’s screen
            {owner.applyingAliases ? " · aliases on" : owner.followSeat === "nathan" ? " · Madison real names" : " · aliases off"}
          </p>
          <button type="button" onClick={() => owner.setFollowSeat("owner")} className="text-sm underline">
            Stop following
          </button>
        </div>
      ) : null}
      {buildDesk && owner && owner.followSeat === "owner" && owner.viewAs !== "owner" ? (
        <div className="viewas-banner mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm">Viewing as {seatLabel(owner.viewAs, owner.people)}</p>
          <button type="button" onClick={() => owner.setViewAs("owner")} className="text-sm underline">
            Back to me
          </button>
        </div>
      ) : null}
    </>
  );
}

function RepublishBanner({ now }: { now: number }) {
  const owner = useOwnerDesk();
  const { user } = useSession();
  const pub = owner?.republish;
  if (!pub?.active) return null;
  const remaining = pub.until ? Math.max(0, pub.until - now) : 0;
  const testersWait = pub.waitMinutes === 0 || remaining === 0;
  if (testersWait && user?.role !== "owner") {
    return <div className="republish-banner mb-4 px-4 py-3">Wait — we’re republishing. Don’t keep typing.</div>;
  }
  if (user?.role !== "owner") return null;
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return (
    <div className="republish-banner mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p>
        {pub.waitMinutes === 0
          ? "Immediate republish. Testers lock. Owner stays in."
          : `Heads up — republish. Comes down in ${mins}:${String(secs).padStart(2, "0")}. Save.`}
        {pub.note ? ` ${pub.note}` : ""}
      </p>
    </div>
  );
}
