/** Session-scoped Jobs tree expand path. Cleared on logout / next sign-in. */

export const JOB_TREE_EXPAND_KEY = "hs_jobs_tree_expand_v1";

export type JobTreeExpandStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

export type JobTreeExpandState = {
  email: string;
  openCompanyId: string;
  collapsedDivisions: string[];
  collapsedClients: string[];
  collapsedSites: string[];
};

export function emptyJobTreeExpand(email = ""): JobTreeExpandState {
  return {
    email,
    openCompanyId: "",
    collapsedDivisions: [],
    collapsedClients: [],
    collapsedSites: [],
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function parseJobTreeExpand(raw: unknown, email = ""): JobTreeExpandState {
  const empty = emptyJobTreeExpand(email);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const row = raw as Partial<JobTreeExpandState>;
  const storedEmail = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
  const seat = email.trim().toLowerCase();
  if (seat && storedEmail && storedEmail !== seat) return empty;
  return {
    email: storedEmail || seat,
    openCompanyId: typeof row.openCompanyId === "string" ? row.openCompanyId : "",
    collapsedDivisions: asStringArray(row.collapsedDivisions),
    collapsedClients: asStringArray(row.collapsedClients),
    collapsedSites: asStringArray(row.collapsedSites),
  };
}

export function readJobTreeExpand(store: JobTreeExpandStore | null | undefined, email = ""): JobTreeExpandState {
  if (!store) return emptyJobTreeExpand(email);
  try {
    const raw = store.getItem(JOB_TREE_EXPAND_KEY);
    if (!raw) return emptyJobTreeExpand(email);
    return parseJobTreeExpand(JSON.parse(raw), email);
  } catch {
    return emptyJobTreeExpand(email);
  }
}

export function writeJobTreeExpand(
  store: JobTreeExpandStore | null | undefined,
  patch: Partial<JobTreeExpandState> & { email: string },
) {
  if (!store) return;
  const email = patch.email.trim().toLowerCase();
  if (!email) return;
  const current = readJobTreeExpand(store, email);
  const next: JobTreeExpandState = {
    email,
    openCompanyId: typeof patch.openCompanyId === "string" ? patch.openCompanyId : current.openCompanyId,
    collapsedDivisions: Array.isArray(patch.collapsedDivisions)
      ? asStringArray(patch.collapsedDivisions)
      : current.collapsedDivisions,
    collapsedClients: Array.isArray(patch.collapsedClients)
      ? asStringArray(patch.collapsedClients)
      : current.collapsedClients,
    collapsedSites: Array.isArray(patch.collapsedSites) ? asStringArray(patch.collapsedSites) : current.collapsedSites,
  };
  try {
    store.setItem(JOB_TREE_EXPAND_KEY, JSON.stringify(next));
  } catch {
    // sessionStorage can be full / blocked
  }
}

export function clearJobTreeExpand(store?: JobTreeExpandStore | null) {
  const target = store ?? (typeof window === "undefined" ? null : window.sessionStorage);
  if (!target?.removeItem) return;
  try {
    target.removeItem(JOB_TREE_EXPAND_KEY);
  } catch {
    // ignore
  }
}

export function jobTreeExpandStore(): JobTreeExpandStore | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}
