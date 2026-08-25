"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { aliasText, shouldApplyAliases } from "@/lib/catalog-aliases";
import { canUseViewAs, hasBuildDesk, isTester } from "@/lib/desk-role";
import {
  aliasLensFor,
  type FollowSeat,
  type OwnerSettings,
  type RepublishState,
  type ViewAsSeat,
  type ViewResponsibility,
} from "@/lib/owner-desk";
import { isJosephEmail, testerByEmail } from "@/lib/tester-seats";

const JOSEPH_VIEW_KEY = "hs_joseph_view";

type JosephView = {
  viewAs?: ViewAsSeat;
  viewResponsibility?: ViewResponsibility;
  viewSite?: string;
};

function readJosephView(): JosephView {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(JOSEPH_VIEW_KEY);
    return raw ? (JSON.parse(raw) as JosephView) : {};
  } catch {
    return {};
  }
}

function writeJosephView(next: JosephView) {
  window.localStorage.setItem(JOSEPH_VIEW_KEY, JSON.stringify(next));
}

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
  const { user } = useSession();
  const tester = testerByEmail(user?.email || "");
  const [aliasesOn, setAliasesOnState] = useState(false);
  const [followSeat, setFollowSeatState] = useState<FollowSeat>("owner");
  const [viewAs, setViewAsState] = useState<ViewAsSeat>("owner");
  const [viewResponsibility, setViewResponsibility] = useState<ViewResponsibility>("Estimator");
  const [viewSite, setViewSite] = useState("Wood River — Roxana, IL");
  const [republish, setRepublish] = useState<RepublishState | null>(null);

  useEffect(() => {
    if (tester) {
      setAliasesOnState(tester.aliased);
      setFollowSeatState("owner");
      setViewAsState("owner");
      if (isJosephEmail(user?.email)) {
        const saved = readJosephView();
        if (saved.viewResponsibility) setViewResponsibility(saved.viewResponsibility);
        if (saved.viewSite) setViewSite(saved.viewSite);
      }
      fetch("/api/desk/owner-settings", { credentials: "include", cache: "no-store" })
        .then((response) => response.json())
        .then((data) => {
          if (data.republish) setRepublish(data.republish);
        })
        .catch(() => undefined);
      return;
    }
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
  }, [tester, user?.email]);

  const aliasSeat = tester ? (tester.aliased ? "aliased" : "real") : aliasLensFor(followSeat);
  const applyingAliases = shouldApplyAliases(aliasesOn, aliasSeat);

  const setAliasesOn = useCallback((on: boolean) => {
    if (isTester(user) || !hasBuildDesk(user)) return;
    setAliasesOnState(on);
    saveSettings({ aliasesOn: on });
    noteFeature(on ? "Aliases tester view on" : "Aliases real names");
  }, [user]);

  const setFollowSeat = useCallback((seat: FollowSeat) => {
    if (user?.role !== "owner") return;
    setFollowSeatState(seat);
    saveSettings({ followSeat: seat });
    noteFeature(seat === "owner" ? "Stopped Follow" : `Follow ${seat} screen`);
  }, [user?.role]);

  const setViewAs = useCallback((seat: ViewAsSeat) => {
    if (!canUseViewAs(user)) return;
    setViewAsState(seat);
    if (isJosephEmail(user?.email)) {
      writeJosephView({ ...readJosephView(), viewAs: "owner" });
      setViewAsState("owner");
      return;
    }
    if (!hasBuildDesk(user)) return;
    saveSettings({ viewAs: seat });
    noteFeature(seat === "owner" ? "View as owner" : `View as ${seat}`);
  }, [user]);

  const setViewLens = useCallback((responsibility: ViewResponsibility, site: string) => {
    if (!canUseViewAs(user)) return;
    setViewResponsibility(responsibility);
    setViewSite(site);
    if (isJosephEmail(user?.email)) {
      writeJosephView({ ...readJosephView(), viewResponsibility: responsibility, viewSite: site });
      return;
    }
    if (!hasBuildDesk(user)) return;
    saveSettings({ viewResponsibility: responsibility, viewSite: site });
    noteFeature(`View as ${responsibility} · ${site}`);
  }, [user]);

  const alias = useCallback((text: string) => aliasText(text, aliasesOn, aliasSeat), [aliasSeat, aliasesOn]);

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
