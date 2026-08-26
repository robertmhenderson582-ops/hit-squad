import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emailOwnerTicket,
  emailTesterInvite,
  inviteEmailBlocked,
  inviteEmailBody,
  INVITE_SUBJECT,
  LOGIN_URL,
  ticketAssessingAckBody,
  ticketAssessingAckSubject,
  ticketEmailBody,
  ticketEmailConfigured,
  ticketEmailSubject,
  ticketMailRecipients,
} from "./ticket-mail.ts";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { makeTicket } from "./tickets.ts";

describe("ticket email", () => {
  it("does not send when SMTP is not configured, and keeps capture off the mail body", async () => {
    process.env.OWNER_EMAIL = "robertmhenderson582@gmail.com";
    delete process.env.TICKET_SMTP_URL;
    delete process.env.SMTP_URL;
    delete process.env.GMAIL_APP_PASSWORD;
    const row = makeTicket({
      kind: "Broke",
      note: "desk capture failed",
      capture: "data:image/jpeg;base64,AAAA",
      later: false,
      who: "josephmhenderson2002@gmail.com",
    });
    assert.equal(ticketEmailConfigured(), false);
    assert.equal(await emailOwnerTicket(row), false);
    const body = ticketEmailBody(row);
    assert.match(body, /desk capture failed/);
    assert.match(body, /Capture: yes/);
    assert.equal(body.includes("data:image"), false);
    assert.equal(ticketMailRecipients().join(), "robertmhenderson582@gmail.com");
    assert.equal(/madisonltd\.com|p66\.com|login|password/i.test(body), false);
    assert.match(ticketEmailSubject(row), /Hit Squad ticket/);
    assert.equal(ticketAssessingAckSubject(row).startsWith("Re: "), true);
    assert.equal(ticketAssessingAckBody(), "Got it. Assessing.");
    assert.equal(/login|password|madisonltd|p66\.com|hitsquad-desk/i.test(ticketAssessingAckBody()), false);
  });

  it("invite body has no password and no credentials in the URL", () => {
    const body = inviteEmailBody("Casey Jones");
    assert.equal(
      body,
      [
        "Hey Casey,",
        "",
        "Novus here. You've been added to Hit Squad Project Controls.",
        "",
        `Hard-refresh ${LOGIN_URL} and use this email. Check the confidentiality box, then create your own sign-in (8+). That step cannot be skipped.`,
        "",
        "If something looks off, reply on this thread.",
        "",
        "Novus",
      ].join("\n"),
    );
    assert.equal(INVITE_SUBJECT, "Hit Squad Project Controls — you can get in now");
    assert.equal(/password/i.test(body), false);
    assert.equal(body.includes("?"), false);
    assert.equal(inviteEmailBlocked(NOVUS_EMAIL) !== null, true);
    assert.equal(inviteEmailBlocked("x@madisonltd.com") !== null, true);
    assert.equal(inviteEmailBlocked("x@p66.com") !== null, true);
    assert.equal(inviteEmailBlocked("casey.tester@example.com"), null);
  });

  it("does not send an invite when SMTP is not configured", async () => {
    delete process.env.TICKET_SMTP_URL;
    delete process.env.SMTP_URL;
    delete process.env.GMAIL_APP_PASSWORD;
    assert.equal(await emailTesterInvite("casey.tester@example.com", "Casey Jones"), false);
    assert.equal(await emailTesterInvite(NOVUS_EMAIL, "Novus"), false);
  });
});
