export const TICKET_KINDS = [
  "Broke",
  "doesn’t make sense",
  "missing",
  "better way",
  "other",
] as const;

export type TicketKind = (typeof TICKET_KINDS)[number];

export type DeskTicket = {
  id: string;
  kind: TicketKind;
  note: string;
  capture: string | null;
  later: boolean;
  done: boolean;
  notifyFix: boolean | null;
  at: string;
  who: string;
};

export const TICKET_DRAFT_KEY = "hs_ticket_draft";

const tickets: DeskTicket[] = [];

export function isTicketKind(value: unknown): value is TicketKind {
  return typeof value === "string" && (TICKET_KINDS as readonly string[]).includes(value);
}

export function listTickets(who?: string): DeskTicket[] {
  if (!who) return [...tickets];
  return tickets.filter((row) => row.who === who);
}

export function addTicket(input: Omit<DeskTicket, "id" | "at" | "done" | "notifyFix">): DeskTicket {
  const entry: DeskTicket = {
    ...input,
    done: false,
    notifyFix: null,
    id: `tkt-${Date.now()}`,
    at: new Date().toLocaleString("en-GB", { hour12: false }),
  };
  tickets.unshift(entry);
  return entry;
}

export function patchTicket(id: string, patch: Partial<Pick<DeskTicket, "done" | "notifyFix">>): DeskTicket | null {
  const row = tickets.find((item) => item.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  return row;
}

export function removeTicket(id: string) {
  const index = tickets.findIndex((item) => item.id === id);
  if (index >= 0) tickets.splice(index, 1);
}

export function removeDoneTickets() {
  for (let i = tickets.length - 1; i >= 0; i -= 1) {
    if (tickets[i].done) tickets.splice(i, 1);
  }
}

export function ticketCopyText(row: DeskTicket) {
  return `${row.kind} · ${row.who} · ${row.at}\n${row.note || ""}`.trim();
}
