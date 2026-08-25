"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useDisplay } from "@/components/DisplayProvider";
import { PasswordField } from "@/components/PasswordField";
import { useSession } from "@/components/SessionProvider";

function effectiveLock(role: string | undefined, minutes: number) {
  if (role !== "owner") {
    if (minutes === 0 || minutes === 30 || minutes === 60) return 15;
    return Math.min(minutes || 15, 15);
  }
  return minutes;
}

export function InactivityLock() {
  const { prefs, resolvedTheme, flipDayNight } = useDisplay();
  const { user, status, signIn, refresh } = useSession();
  const [warn, setWarn] = useState(false);
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lastActive = useRef(Date.now());
  const minutes = effectiveLock(user?.role, prefs.lockMinutes);

  const bump = useCallback(() => {
    lastActive.current = Date.now();
    setWarn(false);
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !minutes) {
      setWarn(false);
      setLocked(false);
      return;
    }
    const onMove = () => {
      if (!locked) bump();
    };
    window.addEventListener("pointerdown", onMove);
    window.addEventListener("keydown", onMove);
    const tick = window.setInterval(() => {
      const idle = Date.now() - lastActive.current;
      const lockAt = minutes * 60 * 1000;
      if (idle >= lockAt) {
        setLocked(true);
        setWarn(false);
        refresh();
      } else if (idle >= lockAt - 60_000) {
        setWarn(true);
      }
    }, 1000);
    return () => {
      window.removeEventListener("pointerdown", onMove);
      window.removeEventListener("keydown", onMove);
      window.clearInterval(tick);
    };
  }, [bump, locked, minutes, refresh, status]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setError(null);
    try {
      await signIn({ email: user.email, password, acknowledged: true });
      setPassword("");
      setLocked(false);
      bump();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lock stayed on.");
    }
  }

  if (status !== "authenticated") return null;

  return (
    <>
      {warn && !locked ? (
        <div className="lock-warn">
          <p>Session locks in one minute.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={bump} className="rounded-lg bg-steel px-3 py-2 text-white">
              Stay signed in
            </button>
            <button type="button" onClick={() => setLocked(true)} className="rounded-lg border border-steel px-3 py-2">
              Lock now
            </button>
          </div>
        </div>
      ) : null}
      {locked ? (
        <div className="lock-scrim">
          <form onSubmit={unlock} className="lock-card">
            <div className="mb-3 flex justify-end">
              <button type="button" onClick={flipDayNight} className="theme-flip" aria-label="Day or Night">
                {resolvedTheme === "day" ? "☾" : "☀"}
              </button>
            </div>
            <h2 className="font-display text-2xl">Session locked — sign in again</h2>
            <p className="mt-2 text-sm opacity-80">Cookie stays. This overlay re-checks GET /api/auth/session.</p>
            <p className="mt-4 text-sm">{user?.email}</p>
            <div className="mt-3">
              <PasswordField
                label="PASSWORD"
                autoComplete="current-password"
                value={password}
                onChange={setPassword}
              />
            </div>
            {error ? <p className="mt-2 text-sm text-amber-flare">{error}</p> : null}
            <button type="submit" className="mt-4 rounded-lg bg-steel px-4 py-2 text-white">
              Unlock
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
