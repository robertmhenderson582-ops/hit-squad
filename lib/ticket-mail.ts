import { NOVUS_EMAIL } from "./desk-role.ts";
import type { DeskTicket } from "./tickets";

const OWNER_TICKET_EMAIL = "robertmhenderson582@gmail.com";
export const INVITE_SUBJECT = "Hit Squad Project Controls — you can get in now";
export const LOGIN_URL = "https://hitsquad-desk.vercel.app/login";

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

export async function emailOwnerTicket(row: DeskTicket): Promise<boolean> {
  const url = smtpTarget();
  if (!url) return false;
  try {
    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport(url);
    await transporter.sendMail({
      to: ownerInbox(),
      from: process.env.GMAIL_USER || ownerInbox(),
      subject: `Hit Squad ticket · ${row.kind} · ${row.who}`,
      text: ticketEmailBody(row),
    });
    return true;
  } catch {
    return false;
  }
}

export function inviteFirstName(name: string) {
  return name.trim().split(/\s+/).find(Boolean) || "there";
}

export function inviteEmailBody(name: string) {
  const first = inviteFirstName(name);
  return [
    `Hey ${first},`,
    "",
    "Novus here. You've been added to Hit Squad Project Controls.",
    "",
    `Hard-refresh ${LOGIN_URL} and use this email. Check the confidentiality box, then create your own sign-in (8+). That step cannot be skipped.`,
    "",
    "If something looks off, reply on this thread.",
    "",
    "Novus",
  ].join("\n");
}

export function inviteEmailBlocked(email: string): string | null {
  const value = email.trim().toLowerCase();
  if (value === NOVUS_EMAIL) return "Novus is not a tester and is not emailed.";
  const host = value.split("@")[1] || "";
  if (host === "madisonltd.com" || host === "p66.com") {
    return "That inbox is not used for tester invites.";
  }
  return null;
}

export async function emailTesterInvite(to: string, name: string): Promise<boolean> {
  if (inviteEmailBlocked(to)) return false;
  const url = smtpTarget();
  if (!url) return false;
  try {
    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport(url);
    await transporter.sendMail({
      to: to.trim().toLowerCase(),
      from: process.env.GMAIL_USER || ownerInbox(),
      subject: INVITE_SUBJECT,
      text: inviteEmailBody(name),
    });
    return true;
  } catch {
    return false;
  }
}
