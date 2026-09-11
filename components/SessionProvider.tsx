"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isOwnerLoginEmail } from "@/lib/owner-login";
import {
  AUTH_REQUEST_DEADLINE_MS,
  AUTH_TIMEOUT_ERROR,
  SESSION_LOAD_DEADLINE_MS,
  fetchJsonWithDeadline,
} from "@/lib/session-fetch";
import type { PublicUser } from "@/lib/types";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type SignInInput = {
  email: string;
  password?: string;
  newPassword?: string;
  confirmPassword?: string;
  acknowledged: boolean;
};

type ProbeInput = { email: string; acknowledged: boolean; silent?: boolean };

type SessionContextValue = {
  status: SessionStatus;
  user: PublicUser | null;
  error: string | null;
  probeSignIn: (input: ProbeInput) => Promise<"create" | "password">;
  signIn: (input: SignInInput) => Promise<"ok" | "create">;
  acceptUser: (next: PublicUser) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<PublicUser | null>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

async function fetchSession(): Promise<PublicUser | null> {
  try {
    const { ok, data } = await fetchJsonWithDeadline<{ user?: PublicUser | null }>(
      "/api/auth/session",
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
      SESSION_LOAD_DEADLINE_MS,
    );
    if (!ok) return null;
    return data.user ?? null;
  } catch {
    // Hung session GET must not leave AuthGate on CHECKING DESK SESSION.
    return null;
  }
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

  const acceptUser = useCallback((next: PublicUser) => {
    setUser(next);
    setStatus("authenticated");
    setError(null);
  }, []);

  const probeSignIn = useCallback(async (input: ProbeInput): Promise<"create" | "password"> => {
    if (isOwnerLoginEmail(input.email)) return "password";
    if (!input.silent) setError(null);
    let data: { needsCreate?: boolean; needsPassword?: boolean; error?: string };
    let ok = false;
    try {
      const result = await fetchJsonWithDeadline<{
        needsCreate?: boolean;
        needsPassword?: boolean;
        error?: string;
      }>(
        "/api/auth/login",
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ email: input.email, acknowledged: input.acknowledged }),
        },
        AUTH_REQUEST_DEADLINE_MS,
      );
      ok = result.ok;
      data = result.data;
    } catch (error) {
      if (input.silent) return "password";
      const message = error instanceof Error ? error.message : AUTH_TIMEOUT_ERROR;
      setError(message);
      throw new Error(message);
    }
    if (!ok) {
      if (input.silent) return data.needsCreate === true ? "create" : "password";
      const message = data.error || "Sign-in failed. Check the email and password.";
      setError(message);
      throw new Error(message);
    }
    return data.needsCreate === true ? "create" : "password";
  }, []);

  const signIn = useCallback(async (input: SignInInput): Promise<"ok" | "create"> => {
    setError(null);
    const body: SignInInput = isOwnerLoginEmail(input.email)
      ? { email: input.email, password: input.password, acknowledged: input.acknowledged }
      : input;
    let data: { user?: PublicUser; error?: string; needsCreate?: boolean };
    let ok = false;
    try {
      const result = await fetchJsonWithDeadline<{ user?: PublicUser; error?: string; needsCreate?: boolean }>(
        "/api/auth/login",
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        },
        AUTH_REQUEST_DEADLINE_MS,
      );
      ok = result.ok;
      data = result.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : AUTH_TIMEOUT_ERROR;
      setError(message);
      setStatus("unauthenticated");
      setUser(null);
      throw new Error(message);
    }
    if (data.needsCreate === true) {
      return "create";
    }
    if (!ok || !data.user) {
      const message = data.error || "Sign-in failed. Check the email and password.";
      setError(message);
      setStatus("unauthenticated");
      setUser(null);
      throw new Error(message);
    }

    // Login JSON + Set-Cookie is enough to open the desk. Do not block on a
    // second session GET. Soft-verify in the background and overlay live flags.
    setUser(data.user);
    setStatus("authenticated");
    setError(null);
    void fetchSession()
      .then((confirmed) => {
        if (confirmed) setUser(confirmed);
      })
      .catch(() => undefined);
    return "ok";
  }, []);

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
    () => ({ status, user, error, probeSignIn, signIn, acceptUser, signOut, refresh }),
    [status, user, error, probeSignIn, signIn, acceptUser, signOut, refresh],
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
