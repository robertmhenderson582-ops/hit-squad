"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useSession } from "@/components/SessionProvider";

const FEATURES: { test: (path: string) => boolean; label: string }[] = [
  { test: (path) => path === "/", label: "Home" },
  { test: (path) => path === "/rates", label: "save rates" },
  { test: (path) => path === "/tickets", label: "ticket" },
];

export function noteFeatureTrail(detail: string) {
  fetch("/api/desk/activity", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "feature", detail }),
  }).catch(() => undefined);
}

export function noteSessionEnd(end: "idle" | "sign-out", path = "/") {
  fetch("/api/desk/presence", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, end }),
  }).catch(() => undefined);
}

export function FeatureTrail() {
  const { status } = useSession();
  const pathname = usePathname();
  const last = useRef<string>("");

  useEffect(() => {
    if (status !== "authenticated") return;
    const hit = FEATURES.find((item) => item.test(pathname));
    if (!hit || last.current === hit.label) return;
    last.current = hit.label;
    noteFeatureTrail(hit.label);
  }, [pathname, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    function onError(event: ErrorEvent) {
      fetch("/api/desk/activity", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "error", detail: String(event.message || "unhandled").slice(0, 160) }),
      }).catch(() => undefined);
    }
    window.addEventListener("error", onError);
    return () => window.removeEventListener("error", onError);
  }, [status]);

  return null;
}
