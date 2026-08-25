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

export function isTicketKind(value: unknown): value is TicketKind {
  return typeof value === "string" && (TICKET_KINDS as readonly string[]).includes(value);
}

export function makeTicket(input: Omit<DeskTicket, "id" | "at" | "done" | "notifyFix">): DeskTicket {
  return {
    ...input,
    done: false,
    notifyFix: null,
    id: `tkt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toLocaleString("en-GB", { hour12: false }),
  };
}

export function ticketCopyText(row: DeskTicket) {
  return `${row.kind} · ${row.who} · ${row.at}\n${row.note || ""}`.trim();
}
