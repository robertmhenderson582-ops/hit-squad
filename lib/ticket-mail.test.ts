import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emailOwnerNote, emailOwnerTicket, ticketEmailBody, ticketEmailConfigured } from "./ticket-mail.ts";
import { makeTicket } from "./tickets.ts";

describe("ticket email", () => {
  it("does not send when SMTP is not configured, and keeps capture off the mail body", async () => {
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
    assert.equal(await emailOwnerNote("Hit Squad brief · quality · chancec318@yahoo.com", "ITP pack"), false);
    const body = ticketEmailBody(row);
    assert.match(body, /desk capture failed/);
    assert.match(body, /Capture: yes/);
    assert.equal(body.includes("data:image"), false);
  });
});
