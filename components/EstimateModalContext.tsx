"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { NewEstimateModal } from "@/components/NewEstimateModal";

type EstimateModalContextValue = {
  openNewEstimate: (preset?: { client?: string; site?: string }) => void;
};

const EstimateModalContext = createContext<EstimateModalContextValue | null>(null);

export function EstimateModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<{ client?: string; site?: string }>({});

  const openNewEstimate = useCallback((next?: { client?: string; site?: string }) => {
    setPreset(next ?? {});
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ openNewEstimate }), [openNewEstimate]);

  return (
    <EstimateModalContext.Provider value={value}>
      {children}
      {open ? <NewEstimateModal preset={preset} onClose={() => setOpen(false)} /> : null}
    </EstimateModalContext.Provider>
  );
}

export function useEstimateModal() {
  const context = useContext(EstimateModalContext);
  if (!context) {
    throw new Error("useEstimateModal must be used inside EstimateModalProvider");
  }
  return context;
}
