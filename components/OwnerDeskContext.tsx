"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { aliasText, shouldApplyAliases } from "@/lib/catalog-aliases";
import {
  aliasLensFor,
  type FollowSeat,
  type OwnerSettings,
  type RepublishState,
  type ViewAsSeat,
  type ViewResponsibility,
} from "@/lib/owner-desk";

type OwnerDeskState = {
  aliasesOn: boolean;
  followSeat: FollowSeat;
  viewAs: ViewAsSeat;
  viewResponsibility: ViewResponsibility;
  viewSite: string;
  republish: RepublishState | null;
  setAliasesOn: (on: boolean) => void;
  setFollowSeat: (seat: FollowSeat) => void;
  setViewAs: (seat: ViewAsSeat) => void;
  setViewLens: (responsibility: ViewResponsibility, site: string) => void;
  alias: (text: string) => string;
  applyingAliases: boolean;
};

const OwnerDeskContext = createContext<OwnerDeskState | null>(null);

async function saveSettings(next: Partial<OwnerSettings>) {
  await fetch("/api/desk/owner-settings", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(next),
  }).catch(() => undefined);
}

async function noteFeature(detail: string) {
  await fetch("/api/desk/activity", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "feature", detail }),
  }).catch(() => undefined);
}

export function OwnerDeskProvider({ children }: { children: React.ReactNode }) {
  const [aliasesOn, setAliasesOnState] = useState(false);
  const [followSeat, setFollowSeatState] = useState<FollowSeat>("owner");
  const [viewAs, setViewAsState] = useState<ViewAsSeat>("owner");
  const [viewResponsibility, setViewResponsibility] = useState<ViewResponsibility>("Estimator");
  const [viewSite, setViewSite] = useState("Wood River — Roxana, IL");
  const [republish, setRepublish] = useState<RepublishState | null>(null);

  useEffect(() => {
    fetch("/api/desk/owner-settings", { credentials: "include", cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (typeof data.aliasesOn === "boolean") setAliasesOnState(data.aliasesOn);
        if (data.followSeat) setFollowSeatState(data.followSeat);
        if (data.viewAs) setViewAsState(data.viewAs);
        if (data.viewResponsibility) setViewResponsibility(data.viewResponsibility);
        if (data.viewSite) setViewSite(data.viewSite);
        if (data.republish) setRepublish(data.republish);
      })
      .catch(() => undefined);
  }, []);

  const applyingAliases = shouldApplyAliases(aliasesOn, aliasLensFor(followSeat));

  const setAliasesOn = useCallback((on: boolean) => {
    setAliasesOnState(on);
    saveSettings({ aliasesOn: on });
    noteFeature(on ? "Aliases tester view on" : "Aliases real names");
  }, []);

  const setFollowSeat = useCallback((seat: FollowSeat) => {
    setFollowSeatState(seat);
    saveSettings({ followSeat: seat });
    noteFeature(seat === "owner" ? "Stopped Follow" : `Follow ${seat} screen`);
  }, []);

  const setViewAs = useCallback((seat: ViewAsSeat) => {
    setViewAsState(seat);
    saveSettings({ viewAs: seat });
    noteFeature(seat === "owner" ? "View as owner" : `View as ${seat}`);
  }, []);

  const setViewLens = useCallback((responsibility: ViewResponsibility, site: string) => {
    setViewResponsibility(responsibility);
    setViewSite(site);
    saveSettings({ viewResponsibility: responsibility, viewSite: site });
    noteFeature(`View as ${responsibility} · ${site}`);
  }, []);

  const alias = useCallback((text: string) => aliasText(text, aliasesOn, aliasLensFor(followSeat)), [aliasesOn, followSeat]);

  const value = useMemo<OwnerDeskState>(
    () => ({
      aliasesOn,
      followSeat,
      viewAs,
      viewResponsibility,
      viewSite,
      republish,
      setAliasesOn,
      setFollowSeat,
      setViewAs,
      setViewLens,
      alias,
      applyingAliases,
    }),
    [aliasesOn, followSeat, viewAs, viewResponsibility, viewSite, republish, setAliasesOn, setFollowSeat, setViewAs, setViewLens, alias, applyingAliases],
  );

  return <OwnerDeskContext.Provider value={value}>{children}</OwnerDeskContext.Provider>;
}

export function useOwnerDesk() {
  return useContext(OwnerDeskContext);
}

export function useAlias() {
  const ctx = useContext(OwnerDeskContext);
  return ctx?.alias ?? ((text: string) => text);
}
