import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { ticketsForViewer } from "./ticket-cache.ts";
import {
  postTicketInboxNotice,
  resetInboxStoreForTests,
  SUGGESTION_BOX_PERSON_ID,
  threadsForViewer,
  unloadInboxStoreForTests,
} from "./inbox-store.ts";
import {
  addStoredTicket,
  listStoredTickets,
  resetTicketStoreForTests,
  ticketStoreKind,
} from "./ticket-store.ts";
import { makeTicket } from "./tickets.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-tickets-"));
const file = join(dir, "tickets.json");

after(() => {
  resetTicketStoreForTests();
  resetInboxStoreForTests();
});

describe("ticket file store", { concurrency: 1 }, () => {
  it("is not a module-level array — a reload from disk still has the ticket", () => {
    resetTicketStoreForTests(file);
    const tester = makeTicket({
      kind: "Broke",
      note: "clock did not add",
      capture: null,
      later: false,
      who: "josephmhenderson2002@gmail.com",
    });
    addStoredTicket(tester);
    resetTicketStoreForTests(file);
    const again = listStoredTickets();
    assert.equal(again.length, 1);
    assert.equal(again[0].id, tester.id);
    assert.equal(again[0].note, "clock did not add");
    const raw = JSON.parse(readFileSync(file, "utf8")) as { tickets: Array<{ id: string }> };
    assert.equal(raw.tickets[0].id, tester.id);
    assert.equal(ticketStoreKind(), "server-json-file");
  });

  it("testers see only their own tickets; owner and Novus see all", () => {
    resetTicketStoreForTests(join(dir, "scope.json"));
    const joseph = addStoredTicket(
      makeTicket({
        kind: "missing",
        note: "joseph only",
        capture: null,
        later: false,
        who: "josephmhenderson2002@gmail.com",
      }),
    );
    const mark = addStoredTicket(
      makeTicket({
        kind: "other",
        note: "mark only",
        capture: null,
        later: false,
        who: "marks544@yahoo.com",
      }),
    );
    const all = listStoredTickets();
    assert.equal(
      ticketsForViewer(all, "josephmhenderson2002@gmail.com", false).map((row) => row.id).join(),
      joseph.id,
    );
    assert.equal(ticketsForViewer(all, "marks544@yahoo.com", false).map((row) => row.id).join(), mark.id);
    assert.equal(ticketsForViewer(all, "nobody@example.com", false).length, 0);
    assert.equal(ticketsForViewer(all, "robertmhenderson582@gmail.com", true).length, 2);
    assert.equal(ticketsForViewer(all, "robertmhenderson582+novus@gmail.com", true).length, 2);
  });

  it("adding a ticket does not drop tickets already on disk", () => {
    const keepFile = join(dir, "keep.json");
    resetTicketStoreForTests(keepFile);
    const first = addStoredTicket(
      makeTicket({
        kind: "Broke",
        note: "first stays",
        capture: null,
        later: false,
        who: "robertmhenderson582@gmail.com",
      }),
    );
    const second = addStoredTicket(
      makeTicket({
        kind: "missing",
        note: "second added",
        capture: null,
        later: false,
        who: "robertmhenderson582@gmail.com",
      }),
    );
    resetTicketStoreForTests(keepFile);
    const again = listStoredTickets();
    assert.equal(again.length, 2);
    assert.equal(again.some((row) => row.id === first.id), true);
    assert.equal(again.some((row) => row.id === second.id), true);
  });

  it("a filed ticket is still on disk and in owner Inbox after a store reload", () => {
    const ticketFile = join(dir, "desk-ticket.json");
    const inboxFile = join(dir, "desk-inbox.json");
    resetTicketStoreForTests(ticketFile);
    resetInboxStoreForTests(inboxFile);
    const filed = addStoredTicket(
      makeTicket({
        kind: "Broke",
        note: "Hello from Suggestion Box",
        capture: null,
        later: false,
        who: "josephmhenderson2002@gmail.com",
      }),
    );
    postTicketInboxNotice(filed);
    resetTicketStoreForTests(ticketFile);
    unloadInboxStoreForTests();
    assert.equal(listStoredTickets("josephmhenderson2002@gmail.com")[0]?.note, "Hello from Suggestion Box");
    assert.equal(listStoredTickets("marks544@yahoo.com").length, 0);
    const ownerBox = threadsForViewer({
      email: "robertmhenderson582@gmail.com",
      name: "Robert Henderson",
      role: "owner",
    }).find((row) => row.personId === SUGGESTION_BOX_PERSON_ID);
    assert.equal(ownerBox?.messages.some((row) => row.text.includes("Hello from Suggestion Box")), true);
    const josephBox = threadsForViewer({
      email: "josephmhenderson2002@gmail.com",
      name: "Joseph Henderson",
      role: "tester",
    });
    assert.equal(
      josephBox.some((row) => row.messages.some((message) => message.text.includes("Hello from Suggestion Box"))),
      false,
    );
  });
});
