"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { aliasText, shouldApplyAliases } from "@/lib/catalog-aliases";
import { activeLensSeat, canUseFollow, canUseViewAs, deskLensKey, hasBuildDesk, isTester, lensUser, testerFromViewAs, viewingAsOther } from "@/lib/desk-role";
import { setVaultViewAs } from "@/lib/estimate-vault-client";
import {
  aliasLensFor,
  isFollowSeat,
  isViewAsSeat,
  preferredFollowSeat,
  preferredViewAs,
  type FollowSeat,
  type OwnerSettings,
  type RepublishState,
  type ViewAsSeat,
  type ViewResponsibility,
} from "@/lib/owner-desk";
import { followLandPath } from "@/lib/follow";
import { isJosephEmail, testerByEmail } from "@/lib/tester-seats";

const JOSEPH_VIEW_KEY = "hs_joseph_view";
const VIEW_AS_STORE = "hs_view_as";
const FOLLOW_STORE = "hs_follow";

function readStoredViewAs(): ViewAsSeat | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(VIEW_AS_STORE);
    return isViewAsSeat(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredViewAs(seat: ViewAsSeat) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(VIEW_AS_STORE, seat);
  } catch {
    // keep the in-memory lens
  }
}

function readStoredFollow(): FollowSeat | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(FOLLOW_STORE);
    return isFollowSeat(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredFollow(seat: FollowSeat) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FOLLOW_STORE, seat);
  } catch {
    // keep the in-memory lens
  }
}

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
  lensReady: boolean;
  setAliasesOn: (on: boolean) => void;
  setFollowSeat: (seat: FollowSeat, land?: string) => void;
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
  const [lensReady, setLensReady] = useState(!hasBuildDesk(user));

  useLayoutEffect(() => {
    if (tester || !hasBuildDesk(user)) {
      setViewAsState("owner");
      setFollowSeatState("owner");
      setVaultViewAs(null);
      setLensReady(true);
      return;
    }
    const stored = readStoredViewAs();
    const storedFollow = readStoredFollow();
    if (stored) setViewAsState(stored);
    if (storedFollow) setFollowSeatState(storedFollow);
    setVaultViewAs(activeLensSeat(stored, storedFollow));
    setLensReady(true);
  }, [tester, user]);

  useEffect(() => {
    setVaultViewAs(hasBuildDesk(user) ? activeLensSeat(viewAs, followSeat) : null);
  }, [followSeat, user, viewAs]);

  useEffect(() => {
    if (tester) {
      setAliasesOnState(tester.aliased);
      setFollowSeatState("owner");
      setViewAsState("owner");
      writeStoredViewAs("owner");
      writeStoredFollow("owner");
      setLensReady(true);
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
    if (!hasBuildDesk(user)) {
      setLensReady(true);
      return;
    }
    fetch("/api/desk/owner-settings", { credentials: "include", cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (typeof data.aliasesOn === "boolean") setAliasesOnState(data.aliasesOn);
        const nextFollow = preferredFollowSeat(readStoredFollow(), data.followSeat);
        setFollowSeatState(nextFollow);
        writeStoredFollow(nextFollow);
        const nextView = preferredViewAs(readStoredViewAs(), data.viewAs);
        setViewAsState(nextView);
        writeStoredViewAs(nextView);
        if (data.viewResponsibility) setViewResponsibility(data.viewResponsibility);
        if (data.viewSite) setViewSite(data.viewSite);
        if (data.republish) setRepublish(data.republish);
        setLensReady(true);
      })
      .catch(() => setLensReady(true));
  }, [tester, user]);

  const viewedSeat = hasBuildDesk(user) && viewingAsOther(viewAs) ? testerFromViewAs(viewAs) : undefined;
  const aliasSeat = viewedSeat
    ? viewedSeat.aliased
      ? "aliased"
      : "real"
    : tester
      ? tester.aliased
        ? "aliased"
        : "real"
      : aliasLensFor(followSeat);
  const applyingAliases = viewedSeat
    ? viewedSeat.aliased
    : tester
      ? tester.aliased
      : shouldApplyAliases(aliasesOn, aliasSeat);

  const setAliasesOn = useCallback((on: boolean) => {
    if (isTester(user) || !hasBuildDesk(user)) return;
    setAliasesOnState(on);
    saveSettings({ aliasesOn: on });
    noteFeature(on ? "Aliases tester view on" : "Aliases real names");
  }, [user]);

  const setFollowSeat = useCallback((seat: FollowSeat, land?: string) => {
    if (!canUseFollow(user)) return;
    const lens = seat === "owner" ? "owner" : seat;
    writeStoredFollow(seat);
    writeStoredViewAs(lens);
    saveSettings({ followSeat: seat, viewAs: lens });
    noteFeature(seat === "owner" ? "Stopped Follow" : `Follow ${seat} screen`);
    if (seat !== "owner") {
      window.location.assign(followLandPath(land ?? "/"));
      return;
    }
    setFollowSeatState("owner");
    setViewAsState("owner");
  }, [user]);

  const setViewAs = useCallback((seat: ViewAsSeat) => {
    if (!canUseViewAs(user)) return;
    setViewAsState(seat);
    if (isJosephEmail(user?.email)) {
      writeJosephView({ ...readJosephView(), viewAs: "owner" });
      setViewAsState("owner");
      return;
    }
    if (!hasBuildDesk(user)) return;
    writeStoredViewAs(seat);
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
      lensReady,
      setAliasesOn,
      setFollowSeat,
      setViewAs,
      setViewLens,
      alias,
      applyingAliases,
    }),
    [aliasesOn, followSeat, viewAs, viewResponsibility, viewSite, republish, lensReady, setAliasesOn, setFollowSeat, setViewAs, setViewLens, alias, applyingAliases],
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

export function useLensUser() {
  const { user } = useSession();
  const desk = useOwnerDesk();
  const viewAs = desk?.viewAs;
  const followSeat = desk?.followSeat;
  const userKey = deskLensKey(user);
  const userRef = useRef(user);
  userRef.current = user;
  return useMemo(() => lensUser(userRef.current, viewAs, followSeat), [userKey, viewAs, followSeat]);
}

export function useDeskLens() {
  const { user } = useSession();
  const desk = useOwnerDesk();
  const viewAs = desk?.viewAs;
  const followSeat = desk?.followSeat;
  const userKey = deskLensKey(user);
  const userRef = useRef(user);
  userRef.current = user;
  const seat = activeLensSeat(viewAs, followSeat);
  const lens = useMemo(() => lensUser(userRef.current, viewAs, followSeat), [userKey, viewAs, followSeat]);
  const lensKey = deskLensKey(lens);
  return useMemo(
    () => ({
      session: userRef.current,
      lens,
      seat,
      viewingAs: Boolean(seat),
      lensReady: desk?.lensReady ?? true,
      lensKey,
    }),
    [userKey, lens, lensKey, seat, desk?.lensReady],
  );
}
