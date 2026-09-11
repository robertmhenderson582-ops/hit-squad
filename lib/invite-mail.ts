export {
  FORBIDDEN_INVITE_DOMAIN,
  INVITE_FORBIDDEN_DOMAIN,
  INVITE_NOT_CONFIGURED,
  INVITE_SEND_UNCONFIRMED,
  NOVUS_INVITE_FROM,
  inviteEmailAllowed,
} from "./invite-policy.ts";
import {
  INVITE_FORBIDDEN_DOMAIN,
  INVITE_NOT_CONFIGURED,
  INVITE_SEND_UNCONFIRMED,
  NOVUS_INVITE_FROM,
  inviteEmailAllowed,
} from "./invite-policy.ts";

export type SeatInviteDraft = {
  to: string;
  name: string;
  tempPassword: string;
  doors: string[];
  from?: string;
};

export type SeatInviteMail = {
  from: string;
  to: string;
  subject: string;
  text: string;
};

function smtpTarget() {
  if (process.env.TICKET_SMTP_URL) return process.env.TICKET_SMTP_URL;
  if (process.env.SMTP_URL) return process.env.SMTP_URL;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) return null;
  const user = encodeURIComponent(process.env.GMAIL_USER || NOVUS_INVITE_FROM);
  return `smtps://${user}:${encodeURIComponent(pass)}@smtp.gmail.com:465`;
}

export function inviteMailConfigured() {
  return Boolean(smtpTarget());
}

export function seatInviteMail(draft: SeatInviteDraft): SeatInviteMail {
  const to = draft.to.trim().toLowerCase();
  const name = draft.name.trim() || to;
  const doors = draft.doors.length ? draft.doors.join(", ") : "none yet — Owner assigns doors on this desk";
  return {
    from: (draft.from || NOVUS_INVITE_FROM).trim().toLowerCase() || NOVUS_INVITE_FROM,
    to,
    subject: "Hit Squad desk invite",
    text: [
      `Hello ${name},`,
      "",
      "Robert added you to the Hit Squad desk.",
      "Sign in with this email and the one-time password below. Change it on first sign-in.",
      "",
      `One-time password: ${draft.tempPassword}`,
      `Doors: ${doors}`,
      "",
      "This mail is from Novus Gmail. It is not Inbox.",
    ].join("\n"),
  };
}

export async function sendSeatInvite(
  draft: SeatInviteDraft,
  opts?: { send?: boolean },
): Promise<{ sent: boolean; mail: SeatInviteMail; error?: string }> {
  const mail = seatInviteMail(draft);
  if (opts?.send !== true) {
    return { sent: false, mail, error: INVITE_SEND_UNCONFIRMED };
  }
  if (!inviteEmailAllowed(mail.to)) {
    return { sent: false, mail, error: INVITE_FORBIDDEN_DOMAIN };
  }
  if (mail.from !== NOVUS_INVITE_FROM) {
    return { sent: false, mail, error: "Invites send from hitsquad.novus@gmail.com only." };
  }
  const url = smtpTarget();
  if (!url) {
    return { sent: false, mail, error: INVITE_NOT_CONFIGURED };
  }
  try {
    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport(url);
    await transporter.sendMail({
      to: mail.to,
      from: mail.from,
      subject: mail.subject,
      text: mail.text,
    });
    return { sent: true, mail };
  } catch {
    return { sent: false, mail, error: "Could not send from Novus Gmail. Try again." };
  }
}
