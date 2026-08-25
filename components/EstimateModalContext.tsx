"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { NewEstimateModal } from "@/components/NewEstimateModal";

type EstimatePreset = { client?: string; site?: string; size?: "outage" | "other" | "shop"; knownPlant?: boolean };

type EstimateModalContextValue = {
  openNewEstimate: (preset?: EstimatePreset) => void;
  newEstimateOpen: boolean;
  newEstimatePreset: EstimatePreset;
  closeNewEstimate: () => void;
};

const EstimateModalContext = createContext<EstimateModalContextValue | null>(null);

export function EstimateModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<EstimatePreset>({});

  const openNewEstimate = useCallback((next?: EstimatePreset) => {
    setPreset(next ?? {});
    setOpen(true);
  }, []);

  const closeNewEstimate = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({
      openNewEstimate,
      newEstimateOpen: open,
      newEstimatePreset: preset,
      closeNewEstimate,
    }),
    [closeNewEstimate, open, openNewEstimate, preset],
  );

  return <EstimateModalContext.Provider value={value}>{children}</EstimateModalContext.Provider>;
}

/** Rendered inside the desk capture root so the open popup is in the shot. */
export function NewEstimateHost() {
  const { newEstimateOpen, newEstimatePreset, closeNewEstimate } = useEstimateModal();
  if (!newEstimateOpen) return null;
  return <NewEstimateModal preset={newEstimatePreset} onClose={closeNewEstimate} />;
}

export function useEstimateModal() {
  const context = useContext(EstimateModalContext);
  if (!context) {
    throw new Error("useEstimateModal must be used inside EstimateModalProvider");
  }
  return context;
}
