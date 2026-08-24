"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PublicUser } from "@/lib/types";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type SessionContextValue = {
  status: SessionStatus;
  user: PublicUser | null;
  error: string | null;
  signIn: (input: { email: string; password: string; acknowledged: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<PublicUser | null>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

async function fetchSession(): Promise<PublicUser | null> {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { user?: PublicUser | null };
  return data.user ?? null;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const nextUser = await fetchSession();
    setUser(nextUser);
    setStatus(nextUser ? "authenticated" : "unauthenticated");
    return nextUser;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nextUser = await fetchSession();
      if (cancelled) return;
      setUser(nextUser);
      setStatus(nextUser ? "authenticated" : "unauthenticated");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (input: { email: string; password: string; acknowledged: boolean }) => {
      setError(null);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(input),
      });
      const data = (await response.json()) as { user?: PublicUser; error?: string };
      if (!response.ok || !data.user) {
        const message = data.error || "Sign-in failed. Check the email and password.";
        setError(message);
        setStatus("unauthenticated");
        setUser(null);
        throw new Error(message);
      }

      const confirmed = await fetchSession();
      if (!confirmed) {
        const message = "Session was not established. Stay on this screen.";
        setError(message);
        setStatus("unauthenticated");
        setUser(null);
        throw new Error(message);
      }

      setUser(confirmed);
      setStatus("authenticated");
      setError(null);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(
    () => ({ status, user, error, signIn, signOut, refresh }),
    [status, user, error, signIn, signOut, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return context;
}
