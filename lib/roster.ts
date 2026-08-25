import type { RosterEntry, RosterPermission } from "@/lib/types";

const roster: RosterEntry[] = [];

export const PERMISSIONS: RosterPermission[] = [
  "Staff — estimates only",
  "Look & feel",
  "Cost / HSE",
  "Owner desk",
];

export function listRoster(): RosterEntry[] {
  return [...roster];
}

export function addRosterEntry(input: Omit<RosterEntry, "id" | "signIn">): RosterEntry {
  const entry: RosterEntry = {
    ...input,
    id: `roster-${Date.now()}`,
    signIn: "—",
  };
  roster.push(entry);
  return entry;
}

export function clearRoster() {
  roster.splice(0, roster.length);
}
