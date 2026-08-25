"use client";

import { useEffect, useState } from "react";
import type { ForgebookBoard } from "@/lib/types";

export function useDeskBoard() {
  const [board, setBoard] = useState<ForgebookBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/desk/board", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();
      if (cancelled) return;
      if (!response.ok) {
        setError(data.error || "Desk records stayed on this board.");
        return;
      }
      setBoard(data.board as ForgebookBoard);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { board, error };
}
