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

export function addTicket(input: Omit<DeskTicket, "id" | "at">): DeskTicket {
  const entry: DeskTicket = {
    ...input,
    id: `tkt-${Date.now()}`,
    at: new Date().toLocaleString("en-GB", { hour12: false }),
  };
  tickets.unshift(entry);
  return entry;
}
