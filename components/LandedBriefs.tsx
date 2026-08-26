"use client";

import { useCallback, useEffect, useState } from "react";
import { downloadLandedFile, listLandedBriefs } from "@/lib/brief-vault-client";
import type { LandedBrief } from "@/lib/drive-briefs";
import type { LeadKind } from "@/lib/lead-briefs";

function stamp(value: string) {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return value || "Unknown time";
  return new Date(at).toLocaleString("en-GB", { hour12: false });
}

export function LandedBriefs({ kind }: { kind: LeadKind }) {
  const [briefs, setBriefs] = useState<LandedBrief[]>([]);
  const [store, setStore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await listLandedBriefs(kind);
      setBriefs(next.briefs);
      setStore(next.store);
      setError(null);
    } catch {
      setError("Landed briefs could not load.");
    }
  }, [kind]);

  useEffect(() => {
    void refresh();
    function onChange() {
      void refresh();
    }
    window.addEventListener("hs-briefs-changed", onChange);
    return () => window.removeEventListener("hs-briefs-changed", onChange);
  }, [refresh]);

  async function openFile(fileId: string, name: string) {
    setBusy(fileId);
    try {
      await downloadLandedFile(fileId, name);
      setError(null);
    } catch {
      setError("That file could not open.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="plant-card px-5 py-5">
      <h2 className="text-2xl font-semibold text-[#163038]">Landed briefs</h2>
      <p className="mt-2 text-sm text-[#5b6f73]">
        Every tester Save for this desk. Open a file to download the vault copy.
      </p>
      {store === "unconfigured" ? (
        <p className="mt-2 text-sm text-[#5b6f73]">
          Vault copy is waiting on the Drive key. Local Save on each desk is unchanged.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-[#5b6f73]">{error}</p> : null}
      {briefs.length === 0 && store !== "unconfigured" ? (
        <p className="mt-3 text-sm text-[#5b6f73]">No landed briefs yet.</p>
      ) : null}
      <div className="mt-3 space-y-3">
        {briefs.map((brief) => (
          <article key={brief.id} className="rounded-lg border border-[#d5e0de] px-4 py-3">
            <p className="font-semibold text-[#163038]">
              {brief.whoName} · {brief.who}
            </p>
            <p className="mt-1 text-xs text-[#5b6f73]">{stamp(brief.savedAt)}</p>
            <p className="mt-2 text-sm">{brief.describe || "No description."}</p>
            <ul className="mt-2 space-y-1">
              {brief.files.length === 0 ? (
                <li className="text-xs text-[#5b6f73]">No forms.</li>
              ) : (
                brief.files.map((file) => (
                  <li key={file.id}>
                    <button
                      type="button"
                      onClick={() => openFile(file.id, file.name)}
                      disabled={busy === file.id}
                      className="text-sm underline"
                    >
                      {file.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
