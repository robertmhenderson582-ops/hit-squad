"use client";

import { FormEvent, useState } from "react";
import { PasswordField } from "@/components/PasswordField";
import { useSession } from "@/components/SessionProvider";
import { mustChangeGateBlocks } from "@/lib/login-form";

export function MustChangePasswordGate({ children }: { children: React.ReactNode }) {
  const { user, status, refresh, acceptUser } = useSession();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [released, setReleased] = useState(false);

  const blocked = mustChangeGateBlocks({
    status,
    mustChangePassword: user?.mustChangePassword,
    released,
  });

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
    if (!response.ok || !data.ok || data.vaultPersisted === false) {
      setMessage(data.error || "Password was not saved.");
      return;
    }
    const cleared = data.user
      ? { ...data.user, mustChangePassword: false }
      : user
        ? { ...user, mustChangePassword: false }
        : null;
    if (cleared) acceptUser(cleared);
    setReleased(true);
    setNext("");
    setConfirm("");
    await refresh();
  }

  if (!blocked) return <>{children}</>;

  return (
    <div className="industrial-root flex min-h-screen items-center justify-center px-4">
      <section className="plant-card w-full max-w-md px-5 py-6">
        <p className="text-xs tracking-[0.18em] text-[#5b6f73]">SET A PASSWORD</p>
        <h1 className="mt-2 font-display text-3xl tracking-[0.08em] text-[#163038]">Choose a lasting password</h1>
        <p className="mt-3 text-sm leading-6 text-[#5b6f73]">
          The password you just used was temporary. Choose 8+ characters. This is the last step
          before the desk opens — you will not be asked to sign in again.
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
