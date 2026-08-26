"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isOwnerLoginEmail } from "@/lib/owner-login";
import type { PublicUser } from "@/lib/types";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type SignInInput = {
  email: string;
  password?: string;
  newPassword?: string;
  confirmPassword?: string;
  acknowledged: boolean;
};

type SessionContextValue = {
  status: SessionStatus;
  user: PublicUser | null;
  error: string | null;
  probeSignIn: (input: { email: string; acknowledged: boolean }) => Promise<"create" | "password">;
  signIn: (input: SignInInput) => Promise<void>;
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

  const probeSignIn = useCallback(
    async (input: { email: string; acknowledged: boolean }): Promise<"create" | "password"> => {
      if (isOwnerLoginEmail(input.email)) return "password";
      setError(null);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: input.email, acknowledged: input.acknowledged }),
      });
      const data = (await response.json()) as {
        needsCreate?: boolean;
        needsPassword?: boolean;
        error?: string;
      };
      if (!response.ok) {
        const message = data.error || "Sign-in failed. Check the email and password.";
        setError(message);
        throw new Error(message);
      }
      return data.needsCreate === true ? "create" : "password";
    },
    [],
  );

  const signIn = useCallback(
    async (input: SignInInput) => {
      setError(null);
      const body: SignInInput = isOwnerLoginEmail(input.email)
        ? { email: input.email, password: input.password, acknowledged: input.acknowledged }
        : input;
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
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
    () => ({ status, user, error, probeSignIn, signIn, signOut, refresh }),
    [status, user, error, probeSignIn, signIn, signOut, refresh],
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
