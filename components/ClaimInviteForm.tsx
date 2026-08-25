"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";

export function ClaimInviteForm() {
  const router = useRouter();
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!acknowledged) {
      setError("Acknowledge the confidentiality notice before setting a password.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/claim", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password, acknowledged: true }),
      });
      const data = (await response.json()) as { user?: unknown; error?: string };
      if (!response.ok || !data.user) {
        throw new Error(data.error || "Could not open this invite.");
      }
      const confirmed = await refresh();
      if (!confirmed) {
        throw new Error("Session was not established. Stay on this screen.");
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open this invite.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4 border-t border-steel-rim/30 pt-6" noValidate>
      <p className="font-mono text-[10px] tracking-[0.24em] text-steel-glow">FIRST VISIT — SET YOUR PASSWORD</p>
      <p className="text-sm leading-6 text-paper-cream/80">
        Invite only. No public create-account. Do not reuse an old password. After this, use Enter the
        desk with the password you chose.
      </p>
      <label className="flex items-start gap-3 text-sm leading-6 text-paper-cream/90">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="mt-1 h-4 w-4 accent-steel"
        />
        <span>I understand this is confidential estimating work and I will not share it.</span>
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-[0.24em] text-steel-glow">INVITE EMAIL</span>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full border border-steel-rim/40 bg-ink/70 px-3 py-2 font-mono text-sm text-paper-cream"
          required
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-[0.24em] text-steel-glow">NEW PASSWORD</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={10}
          className="mt-1 w-full border border-steel-rim/40 bg-ink/70 px-3 py-2 font-mono text-sm text-paper-cream"
          required
        />
      </label>
      {error ? (
        <p role="alert" className="border border-amber-flare/70 bg-amber-flare/10 px-3 py-2 font-mono text-sm text-amber-label">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!acknowledged || submitting}
        className="w-full border border-steel-glow/50 bg-ink/60 px-4 py-3 font-display text-lg tracking-[0.18em] text-paper-cream disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "OPENING INVITE" : "SET PASSWORD AND ENTER"}
      </button>
    </form>
  );
}
