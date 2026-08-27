import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { ticketsForViewer } from "./ticket-cache.ts";
import {
  addStoredTicket,
  forgetTicketCacheForTests,
  listStoredTickets,
  resetTicketStoreForTests,
  ticketStoreKind,
  useTicketVaultForTests,
} from "./ticket-store.ts";
import { makeTicket } from "./tickets.ts";
import { memoryDrive } from "./drive-estimates.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-tickets-"));
const file = join(dir, "tickets.json");

after(() => {
  resetTicketStoreForTests();
});

describe("ticket file store", { concurrency: 1 }, () => {
  it("is not a module-level array — a reload from disk still has the ticket", async () => {
    resetTicketStoreForTests(file);
    const tester = makeTicket({
      kind: "Broke",
      note: "clock did not add",
      capture: null,
      later: false,
      who: "josephmhenderson2002@gmail.com",
    });
    await addStoredTicket(tester);
    resetTicketStoreForTests(file);
    const again = await listStoredTickets();
    assert.equal(again.length, 1);
    assert.equal(again[0].id, tester.id);
    assert.equal(again[0].note, "clock did not add");
    const raw = JSON.parse(readFileSync(file, "utf8")) as { tickets: Array<{ id: string }> };
    assert.equal(raw.tickets[0].id, tester.id);
    assert.equal(ticketStoreKind(), "server-json-file");
  });

  it("testers see only their own tickets; owner and Novus see all", async () => {
    resetTicketStoreForTests(join(dir, "scope.json"));
    const joseph = await addStoredTicket(
      makeTicket({
        kind: "missing",
        note: "joseph only",
        capture: null,
        later: false,
        who: "josephmhenderson2002@gmail.com",
      }),
    );
    const mark = await addStoredTicket(
      makeTicket({
        kind: "other",
        note: "mark only",
        capture: null,
        later: false,
        who: "marks544@yahoo.com",
      }),
    );
    const all = await listStoredTickets();
    assert.equal(
      ticketsForViewer(all, "josephmhenderson2002@gmail.com", false).map((row) => row.id).join(),
      joseph.id,
    );
    assert.equal(ticketsForViewer(all, "marks544@yahoo.com", false).map((row) => row.id).join(), mark.id);
    assert.equal(ticketsForViewer(all, "nobody@example.com", false).length, 0);
    assert.equal(ticketsForViewer(all, "robertmhenderson582@gmail.com", true).length, 2);
    assert.equal(ticketsForViewer(all, "robertmhenderson582+novus@gmail.com", true).length, 2);
  });

  it("adding a ticket does not drop tickets already on disk", async () => {
    const keepFile = join(dir, "keep.json");
    resetTicketStoreForTests(keepFile);
    const first = await addStoredTicket(
      makeTicket({
        kind: "Broke",
        note: "first stays",
        capture: null,
        later: false,
        who: "robertmhenderson582@gmail.com",
      }),
    );
    const second = await addStoredTicket(
      makeTicket({
        kind: "missing",
        note: "second added",
        capture: null,
        later: false,
        who: "robertmhenderson582@gmail.com",
      }),
    );
    resetTicketStoreForTests(keepFile);
    const again = await listStoredTickets();
    assert.equal(again.length, 2);
    assert.equal(again.some((row) => row.id === first.id), true);
    assert.equal(again.some((row) => row.id === second.id), true);
  });

  it("keeps tickets after the local cache is wiped", async () => {
    const drive = memoryDrive();
    resetTicketStoreForTests(join(dir, "vault.json"));
    useTicketVaultForTests(drive);
    const row = await addStoredTicket(
      makeTicket({
        kind: "Broke",
        note: "survives recycle",
        capture: null,
        later: false,
        who: "josephmhenderson2002@gmail.com",
      }),
    );
    forgetTicketCacheForTests();
    useTicketVaultForTests(drive);
    const again = await listStoredTickets();
    assert.equal(again.length, 1);
    assert.equal(again[0].id, row.id);
    assert.equal(again[0].who, "josephmhenderson2002@gmail.com");
    assert.equal((await listStoredTickets("marks544@yahoo.com")).length, 0);
  });
});
