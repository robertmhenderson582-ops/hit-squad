import type { RosterEntry, RosterModules, RosterPermission } from "@/lib/types";

const roster: RosterEntry[] = [];

export const PERMISSIONS: RosterPermission[] = ["Owner", "Trusted", "Look & feel", "Staff"];

export const EMPTY_MODULES: RosterModules = {
  hse: false,
  quality: false,
  accounting: false,
  payroll: false,
};

export function listRoster(): RosterEntry[] {
  return [...roster];
}

export function addRosterEntry(input: Omit<RosterEntry, "id" | "signIn">): RosterEntry {
  const entry: RosterEntry = {
    ...input,
    modules: input.modules ?? EMPTY_MODULES,
    estimate: input.estimate ?? true,
    rateBuilder: input.rateBuilder ?? input.permission !== "Look & feel",
    passwordSet: input.passwordSet ?? false,
    id: `roster-${Date.now()}`,
    signIn: "—",
  };
  roster.push(entry);
  return entry;
}

export function updateRosterEntry(id: string, patch: Partial<RosterEntry>): RosterEntry | null {
  const row = roster.find((item) => item.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  return row;
}

export function removeRosterEntry(id: string) {
  const index = roster.findIndex((item) => item.id === id);
  if (index >= 0) roster.splice(index, 1);
}

export function clearRoster() {
  roster.splice(0, roster.length);
}
