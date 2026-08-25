"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordField } from "@/components/PasswordField";
import { useSession } from "@/components/SessionProvider";

export function LoginForm() {
  const router = useRouter();
  const { signIn, error } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const visibleError = localError || error;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (!acknowledged) {
      setLocalError("Acknowledge the confidentiality notice before signing in.");
      return;
    }

    setSubmitting(true);
    try {
      await signIn({ email, password, acknowledged: true });
      router.replace("/");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <section className="rounded border border-amber-flare/40 bg-black/25 p-4">
        <p className="font-mono text-[10px] tracking-[0.28em] text-amber-label">CONFIDENTIAL</p>
        <p className="mt-2 text-sm leading-6 text-paper-cream/90">
          Madison plant, commercial, and HSE information — and records from other clients and
          contractors — is plugged into this desk only so the trusted circle can estimate outage
          and T&amp;M work. This is not Madison software. It is a private Hit Squad
          field trial. Do not share, copy, screenshot, or discuss this desk or its contents
          outside the people Robert has invited.
        </p>
      </section>

      <label className="flex items-start gap-3 text-sm leading-6 text-paper-cream/90">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="mt-1 h-4 w-4 accent-steel"
        />
        <span>
          I understand this is confidential estimating work and I will not share, copy, or
          discuss it outside the trusted circle.
        </span>
      </label>

      <div className="space-y-3">
        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.24em] text-steel-glow">EMAIL</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full border border-steel-rim/40 bg-ink/70 px-3 py-2 font-mono text-sm text-paper-cream"
            required
          />
        </label>
        <PasswordField
          label="PASSWORD"
          variant="night"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          required
        />
      </div>

      {visibleError ? (
        <p role="alert" className="border border-amber-flare/70 bg-amber-flare/10 px-3 py-2 font-mono text-sm text-amber-label">
          {visibleError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!acknowledged || submitting}
        className="w-full bg-steel px-4 py-3 font-display text-lg tracking-[0.24em] text-paper-cream disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "CHECKING SESSION" : "ENTER THE DESK"}
      </button>
    </form>
  );
}
