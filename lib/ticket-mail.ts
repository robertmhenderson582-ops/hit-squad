import type { DeskTicket } from "./tickets";

const OWNER_TICKET_EMAIL = "robertmhenderson582@gmail.com";

function ownerInbox() {
  return process.env.OWNER_EMAIL || OWNER_TICKET_EMAIL;
}

function smtpTarget() {
  if (process.env.TICKET_SMTP_URL) return process.env.TICKET_SMTP_URL;
  if (process.env.SMTP_URL) return process.env.SMTP_URL;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) return null;
  const user = encodeURIComponent(process.env.GMAIL_USER || ownerInbox());
  return `smtps://${user}:${encodeURIComponent(pass)}@smtp.gmail.com:465`;
}

export function ticketEmailConfigured() {
  return Boolean(smtpTarget());
}

export function ticketEmailBody(row: DeskTicket) {
  return [
    `Kind: ${row.kind}`,
    `Who: ${row.who}`,
    `When: ${row.at}`,
    `Later: ${row.later ? "yes" : "no"}`,
    `Capture: ${row.capture ? "yes (on the desk ticket)" : "no"}`,
    "",
    row.note || "(no note)",
    "",
    "Hit Squad ticket copy. Not Inbox.",
  ].join("\n");
}

export async function emailOwnerNote(subject: string, text: string): Promise<boolean> {
  const url = smtpTarget();
  if (!url) return false;
  try {
    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport(url);
    await transporter.sendMail({
      to: ownerInbox(),
      from: process.env.GMAIL_USER || ownerInbox(),
      subject,
      text,
    });
    return true;
  } catch {
    return false;
  }
}

export async function emailOwnerTicket(row: DeskTicket): Promise<boolean> {
  return emailOwnerNote(`Hit Squad ticket · ${row.kind} · ${row.who}`, ticketEmailBody(row));
}
