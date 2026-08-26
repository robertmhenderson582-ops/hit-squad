"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordField } from "@/components/PasswordField";
import { useSession } from "@/components/SessionProvider";
import { isOwnerLoginEmail } from "@/lib/owner-login";

type Gate = "identify" | "create" | "password";

export function LoginForm() {
  const router = useRouter();
  const { signIn, probeSignIn, error } = useSession();
  const [gate, setGate] = useState<Gate>("identify");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const visibleError = localError || error;

  function resetGate() {
    setGate("identify");
    setPassword("");
    setNextPassword("");
    setConfirmPassword("");
  }

  function onEmailChange(value: string) {
    setEmail(value);
    if (gate !== "identify") resetGate();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (!acknowledged) {
      setLocalError("Acknowledge the confidentiality notice before signing in.");
      return;
    }

    if (isOwnerLoginEmail(email) && gate === "create") {
      setGate("password");
      return;
    }

    if (gate === "identify") {
      if (isOwnerLoginEmail(email)) {
        setGate("password");
        return;
      }
      setSubmitting(true);
      try {
        const next = await probeSignIn({ email, acknowledged: true });
        setGate(isOwnerLoginEmail(email) || next !== "create" ? "password" : "create");
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : "Sign-in failed.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (gate === "create") {
      if (nextPassword.length < 8) {
        setLocalError("Password must be 8+.");
        return;
      }
      if (nextPassword !== confirmPassword) {
        setLocalError("New password and confirm did not match.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (gate === "create") {
        await signIn({
          email,
          acknowledged: true,
          newPassword: nextPassword,
          confirmPassword,
        });
      } else {
        await signIn({ email, password, acknowledged: true });
      }
      fetch("/api/desk/activity", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "sign-in", detail: "Sign-in ok" }),
      }).catch(() => undefined);
      router.replace("/");
    } catch (err) {
      fetch("/api/desk/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "failed", who: email }),
      }).catch(() => undefined);
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
            onChange={(event) => onEmailChange(event.target.value)}
            className="mt-1 w-full border border-steel-rim/40 bg-ink/70 px-3 py-2 font-mono text-sm text-paper-cream"
            required
          />
        </label>

        {gate === "create" && !isOwnerLoginEmail(email) ? (
          <>
            <section className="rounded border border-steel-rim/40 bg-black/25 p-4">
              <p className="font-mono text-[10px] tracking-[0.28em] text-steel-glow">FIRST SIGN-IN</p>
              <p className="mt-2 text-sm leading-6 text-paper-cream/90">
                Create your password (8+ characters). This step cannot be skipped.
              </p>
            </section>
            <PasswordField
              label="NEW PASSWORD"
              variant="night"
              autoComplete="new-password"
              value={nextPassword}
              onChange={setNextPassword}
              minLength={8}
              required
            />
            <PasswordField
              label="CONFIRM PASSWORD"
              variant="night"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              minLength={8}
              required
            />
          </>
        ) : null}

        {gate === "password" ? (
          <PasswordField
            label="PASSWORD"
            variant="night"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            required
          />
        ) : null}
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
        {submitting ? "CHECKING SESSION" : gate === "identify" ? "CONTINUE" : "ENTER THE DESK"}
      </button>
    </form>
  );
}
