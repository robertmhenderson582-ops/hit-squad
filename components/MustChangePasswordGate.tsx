"use client";

import { FormEvent, useState } from "react";
import { PasswordField } from "@/components/PasswordField";
import { useSession } from "@/components/SessionProvider";

export function MustChangePasswordGate({ children }: { children: React.ReactNode }) {
  const { user, status, refresh } = useSession();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const blocked = status === "authenticated" && Boolean(user?.mustChangePassword);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (next.length < 8) {
      setMessage("New password must be 8+.");
      return;
    }
    if (next !== confirm) {
      setMessage("New password and confirm did not match.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/desk/password", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ next }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "Password was not changed.");
      return;
    }
    setNext("");
    setConfirm("");
    await refresh();
  }

  if (!blocked) return <>{children}</>;

  return (
    <div className="industrial-root flex min-h-screen items-center justify-center px-4">
      <section className="plant-card w-full max-w-md px-5 py-6">
        <p className="text-xs tracking-[0.18em] text-[#5b6f73]">FIRST SIGN-IN</p>
        <h1 className="mt-2 font-display text-3xl tracking-[0.08em] text-[#163038]">Set your password</h1>
        <p className="mt-3 text-sm leading-6 text-[#5b6f73]">
          This seat was created by the owner. Choose a password of 8+ characters before the desk
          opens. This screen cannot be skipped. Later this session is not an option.
        </p>
        <form onSubmit={onSubmit} className="mt-5 grid gap-3">
          <PasswordField label="New password" autoComplete="new-password" value={next} onChange={setNext} minLength={8} required />
          <PasswordField
            label="Confirm password"
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
            minLength={8}
            required
          />
          <button type="submit" disabled={busy} className="rounded-lg bg-steel px-4 py-2 text-white">
            {busy ? "Saving…" : "Continue to desk"}
          </button>
        </form>
        {message ? <p className="mt-3 text-sm text-[#b74120]">{message}</p> : null}
      </section>
    </div>
  );
}
