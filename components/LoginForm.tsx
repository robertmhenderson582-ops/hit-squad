"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HoldScreen } from "@/components/HoldScreen";
import { PasswordField } from "@/components/PasswordField";
import { useSession } from "@/components/SessionProvider";
import {
  INITIAL_LOGIN_GATE,
  type LoginGate,
  loginGateAfterProbe,
  loginShowsCreateFields,
  loginShowsPasswordField,
  loginSubmitLabel,
  looksLikeEmail,
} from "@/lib/login-form";
import { isOwnerLoginEmail } from "@/lib/owner-login";

export function LoginForm() {
  const router = useRouter();
  const { signIn, probeSignIn, error } = useSession();
  const [gate, setGate] = useState<LoginGate>(INITIAL_LOGIN_GATE);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const gateRef = useRef(gate);
  const passwordRef = useRef(password);
  gateRef.current = gate;
  passwordRef.current = password;

  const visibleError = localError || error;
  const showPassword = loginShowsPasswordField(gate, email);
  const showCreate = loginShowsCreateFields(gate, email);

  function onEmailChange(value: string) {
    setEmail(value);
    if (gate === "create" || gate === "recover") {
      setGate("password");
      setNextPassword("");
      setConfirmPassword("");
    }
  }

  useEffect(() => {
    if (!acknowledged || !looksLikeEmail(email) || isOwnerLoginEmail(email)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const probe = await probeSignIn({ email, acknowledged: true, silent: true });
        if (cancelled) return;
        const next = loginGateAfterProbe({ email, probe, current: gateRef.current });
        setGate(next);
        if (next === "create") {
          setNextPassword((prev) => prev || passwordRef.current);
        }
      } catch {
        // Keep the password field. Submit still authenticates.
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [acknowledged, email, probeSignIn]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setLocalError(null);

    if (!acknowledged) {
      setLocalError("Acknowledge the confidentiality notice before signing in.");
      return;
    }

    if (isOwnerLoginEmail(email) && gate === "create") {
      setGate("password");
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
      const next =
        gate === "create"
          ? await signIn({
              email,
              acknowledged: true,
              newPassword: nextPassword,
              confirmPassword,
            })
          : await signIn({ email, password, acknowledged: true });
      if (next === "create") {
        setGate("create");
        setNextPassword((prev) => prev || password);
        return;
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
    <form onSubmit={onSubmit} className="relative space-y-5" noValidate>
      {submitting ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded bg-ink/80">
          <HoldScreen label="CHECKING SESSION" variant="compact" />
        </div>
      ) : null}
      <fieldset disabled={submitting} className="space-y-5 border-0 p-0 disabled:opacity-40">
      <section className="rounded border border-amber-flare/40 bg-black/25 p-4">
        <p className="font-mono text-[10px] tracking-[0.28em] text-amber-label">CONFIDENTIAL</p>
        <p className="mt-2 text-sm leading-6 text-paper-cream/90">
          Client plant, commercial, and HSE records — and contractor files — are on this desk
          only so the trusted circle can estimate outage and T&amp;M work. This is a private
          Hit Squad field trial. Do not share, copy, screenshot, or discuss this desk or its
          contents outside the people Robert has invited.
        </p>
      </section>

      <label className="flex items-start gap-3 text-sm leading-6 text-paper-cream/90">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          disabled={submitting}
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
            disabled={submitting}
            className="mt-1 w-full border border-steel-rim/40 bg-ink/70 px-3 py-2 font-mono text-sm text-paper-cream"
            required
          />
        </label>

        {showCreate ? (
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
              disabled={submitting}
            />
            <PasswordField
              label="CONFIRM PASSWORD"
              variant="night"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              minLength={8}
              required
              disabled={submitting}
            />
          </>
        ) : null}

        {showPassword ? (
          <>
            {gate === "recover" ? (
              <p className="text-sm leading-6 text-paper-cream/90">
                Use the one-time recovery password issued for this seat, then change it in Settings.
                The owner issues tester recovery from Settings → Users. This is not a temp-password
                create screen.
              </p>
            ) : null}
            <PasswordField
              label={gate === "recover" ? "RECOVERY PASSWORD" : "PASSWORD"}
              variant="night"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              required
              disabled={submitting}
            />
            {gate === "password" ? (
              <button
                type="button"
                className="font-mono text-[10px] tracking-[0.18em] text-steel-glow underline"
                onClick={() => setGate("recover")}
              >
                Need to get back in?
              </button>
            ) : (
              <button
                type="button"
                className="font-mono text-[10px] tracking-[0.18em] text-steel-glow underline"
                onClick={() => setGate("password")}
              >
                Back to password
              </button>
            )}
          </>
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
        {loginSubmitLabel(gate, submitting)}
      </button>
      </fieldset>
    </form>
  );
}
