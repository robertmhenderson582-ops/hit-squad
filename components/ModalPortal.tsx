"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Confirm / handoff scrims sit on document.body so estimate cards cannot cover them. */
export function ModalPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHost(document.body);
  }, []);
  if (!host) return null;
  return createPortal(children, host);
}
