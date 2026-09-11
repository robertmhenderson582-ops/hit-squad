import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FORBIDDEN_INVITE_DOMAIN,
  INVITE_SEND_UNCONFIRMED,
  NOVUS_INVITE_FROM,
  inviteEmailAllowed,
  inviteMailConfigured,
  seatInviteMail,
  sendSeatInvite,
} from "./invite-mail.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("Owner invite mail", () => {
  it("drafts from Novus Gmail, never madisonltd.com, and does not send without Owner click", async () => {
    delete process.env.TICKET_SMTP_URL;
    delete process.env.SMTP_URL;
    delete process.env.GMAIL_APP_PASSWORD;
    assert.equal(NOVUS_INVITE_FROM, "hitsquad.novus@gmail.com");
    assert.equal(inviteEmailAllowed("beechj@madisonltd.com"), false);
    assert.equal(inviteEmailAllowed("qc@example.com"), true);
    assert.equal(inviteMailConfigured(), false);
    const mail = seatInviteMail({
      to: "qc@example.com",
      name: "Pat",
      tempPassword: "TempPass12",
      doors: ["quality"],
    });
    assert.equal(mail.from, NOVUS_INVITE_FROM);
    assert.match(mail.text, /TempPass12/);
    assert.match(mail.text, /quality/);
    assert.doesNotMatch(mail.text, /madisonltd\.com/);
    const blocked = await sendSeatInvite(
      { to: `freddy@${FORBIDDEN_INVITE_DOMAIN}`, name: "Freddy", tempPassword: "x", doors: [] },
      { send: true },
    );
    assert.equal(blocked.sent, false);
    const held = await sendSeatInvite(
      { to: "qc@example.com", name: "Pat", tempPassword: "TempPass12", doors: ["quality"] },
      { send: false },
    );
    assert.equal(held.sent, false);
    assert.equal(held.error, INVITE_SEND_UNCONFIRMED);
    const route = source("../app/api/desk/invite/route.ts");
    const seats = source("../app/api/desk/seats/route.ts");
    const desk = source("../components/ManageUsersDesk.tsx");
    assert.match(route, /body\.send !== true/);
    assert.match(route, /isOwner/);
    assert.doesNotMatch(seats, /sendSeatInvite/);
    assert.match(desk, /send: true/);
    assert.doesNotMatch(desk, /invite email sent/i);
  });
});
