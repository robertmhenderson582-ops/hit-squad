"use client";

import { useEffect, useState } from "react";
import { useDisplay } from "@/components/DisplayProvider";
import { playInboxChime } from "@/lib/chime";

const THREADS = [
  { id: "1", name: "James Cain", preview: "What do you think?" },
  { id: "2", name: "Mark H Schneider", preview: "Made some updates" },
  { id: "3", name: "Joseph Henderson", preview: "UI is inconsistent when changing ta..." },
];

export function InboxDesk() {
  const { prefs } = useDisplay();
  const [draft, setDraft] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/desk/owner-settings", { credentials: "include", cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setNotice(data.republish?.inboxNotice ?? null))
      .catch(() => undefined);
  }, []);

  return (
    <section className="plant-card mx-auto mt-5 max-w-2xl px-6 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl font-semibold text-[#163038]">Inbox</h2>
          <p className="mt-1 text-sm text-[#5b6f73]">Testers do not see each other.</p>
          {notice ? <p className="mt-2 text-sm text-[#163038]">{notice}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(true);
            if (prefs.inboxSound) playInboxChime();
          }}
          className="rounded-lg bg-steel px-3 py-2 text-white"
        >
          + New
        </button>
      </div>
      <div className="mt-6 space-y-5">
        {THREADS.map((thread) => (
          <article key={thread.id}>
            <p className="font-semibold text-[#163038]">{thread.name}</p>
            <p className="text-sm text-[#5b6f73]">{thread.preview}</p>
          </article>
        ))}
      </div>
      {draft ? (
        <p className="mt-5 text-sm text-[#5b6f73]">
          New thread stays on this owner desk. Testers never see this inbox or each other.
        </p>
      ) : null}
    </section>
  );
}
