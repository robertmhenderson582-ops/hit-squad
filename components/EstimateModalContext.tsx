"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { NewEstimateModal } from "@/components/NewEstimateModal";

type EstimatePreset = { client?: string; site?: string; size?: "outage" | "other" | "shop"; knownPlant?: boolean };

type EstimateModalContextValue = {
  openNewEstimate: (preset?: EstimatePreset) => void;
};

const EstimateModalContext = createContext<EstimateModalContextValue | null>(null);

export function EstimateModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<EstimatePreset>({});

  const openNewEstimate = useCallback((next?: EstimatePreset) => {
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
