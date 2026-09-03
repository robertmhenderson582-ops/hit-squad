import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { ticketsForViewer } from "./ticket-cache.ts";
import {
  addStoredTicket,
  forgetTicketCacheForTests,
  listStoredTickets,
  mergeStoredTickets,
  removeStoredTicket,
  resetTicketStoreForTests,
  staleWarmTicketInstanceForTests,
  ticketStoreKind,
  useTicketVaultForTests,
} from "./ticket-store.ts";
import { TICKETS_VAULT_KIND, TICKETS_VAULT_NAME, readVaultJson } from "./drive-data.ts";
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

  it("two posts from different hydrate resets keep tester tickets in the vault", async () => {
    const drive = memoryDrive();
    resetTicketStoreForTests(join(dir, "wipe.json"));
    useTicketVaultForTests(drive);
    const owner = await addStoredTicket(
      makeTicket({
        kind: "Broke",
        note: "Owner row",
        capture: null,
        later: false,
        who: "robertmhenderson582@gmail.com",
      }),
    );
    staleWarmTicketInstanceForTests();
    const chance = await addStoredTicket(
      makeTicket({
        kind: "better way",
        note: "Chance ticket",
        capture: null,
        later: false,
        who: "chancec318@yahoo.com",
      }),
    );
    const vault = await readVaultTickets(drive);
    assert.equal(vault.some((row) => row.id === owner.id), true);
    assert.equal(vault.some((row) => row.id === chance.id && row.who === "chancec318@yahoo.com"), true);
    assert.equal((await listStoredTickets("chancec318@yahoo.com")).length, 1);
    assert.equal((await listStoredTickets("chancec318@yahoo.com"))[0]?.note, "Chance ticket");
    assert.equal((await listStoredTickets()).length, 2);
  });

  it("hydrate merge does not replace a richer cache with a thinner vault", async () => {
    const drive = memoryDrive();
    const keep = join(dir, "richer.json");
    resetTicketStoreForTests(keep);
    useTicketVaultForTests(drive);
    const owner = await addStoredTicket(
      makeTicket({
        kind: "Broke",
        note: "vault owner",
        capture: null,
        later: false,
        who: "robertmhenderson582@gmail.com",
      }),
    );
    const chance = makeTicket({
      kind: "missing",
      note: "cache only Chance",
      capture: null,
      later: false,
      who: "chancec318@yahoo.com",
    });
    writeFileSync(keep, JSON.stringify({ tickets: [chance] }, null, 2));
    resetTicketStoreForTests(keep);
    useTicketVaultForTests(drive);
    const listed = await listStoredTickets();
    assert.equal(listed.some((row) => row.id === owner.id), true);
    assert.equal(listed.some((row) => row.id === chance.id && row.who === "chancec318@yahoo.com"), true);
    const vault = await readVaultTickets(drive);
    assert.equal(vault.some((row) => row.id === chance.id), true);
  });

  it("union by id does not let a stale list wipe a tester ticket", () => {
    const owner = makeTicket({
      id: "tkt-owner",
      kind: "Broke",
      note: "owner",
      capture: null,
      later: false,
      who: "robertmhenderson582@gmail.com",
    });
    const chance = makeTicket({
      id: "tkt-chance",
      kind: "missing",
      note: "chance",
      capture: null,
      later: false,
      who: "chancec318@yahoo.com",
    });
    const merged = mergeStoredTickets([owner, chance], [owner]);
    assert.equal(merged.length, 2);
    assert.equal(merged.some((row) => row.id === "tkt-chance"), true);
  });

  it("a deleted ticket stays gone after cache wipe and a stale cache merge", async () => {
    const drive = memoryDrive();
    resetTicketStoreForTests(join(dir, "delete.json"));
    useTicketVaultForTests(drive);
    const keep = await addStoredTicket(
      makeTicket({
        kind: "Broke",
        note: "keep me",
        capture: null,
        later: false,
        who: "robertmhenderson582@gmail.com",
      }),
    );
    const gone = await addStoredTicket(
      makeTicket({
        kind: "missing",
        note: "delete me",
        capture: null,
        later: false,
        who: "robertmhenderson582@gmail.com",
      }),
    );
    await removeStoredTicket(gone.id);
    assert.equal((await listStoredTickets()).some((row) => row.id === gone.id), false);

    forgetTicketCacheForTests();
    useTicketVaultForTests(drive);
    const afterWipe = await listStoredTickets();
    assert.equal(afterWipe.some((row) => row.id === keep.id), true);
    assert.equal(afterWipe.some((row) => row.id === gone.id), false);

    writeFileSync(join(dir, "delete.json"), JSON.stringify({ tickets: [keep, gone] }, null, 2));
    resetTicketStoreForTests(join(dir, "delete.json"));
    useTicketVaultForTests(drive);
    const afterPoison = await listStoredTickets();
    assert.equal(afterPoison.some((row) => row.id === keep.id), true);
    assert.equal(afterPoison.some((row) => row.id === gone.id), false);
  });

  it("a failed Drive write throws", async () => {
    resetTicketStoreForTests(join(dir, "fail.json"));
    useTicketVaultForTests({
      configured: true,
      async listJson() {
        return [];
      },
      async readJson() {
        return "{}";
      },
      async createJson() {
        throw new Error("update");
      },
      async updateJson() {
        throw new Error("update");
      },
      async deleteJson() {},
    });
    await assert.rejects(
      () =>
        addStoredTicket(
          makeTicket({
            kind: "Broke",
            note: "must not look saved",
            capture: null,
            later: false,
            who: "chancec318@yahoo.com",
          }),
        ),
      /update/,
    );
  });
});

async function readVaultTickets(drive: ReturnType<typeof memoryDrive>) {
  const raw = await readVaultJson<{ tickets?: Array<{ id: string; who?: string; note?: string }> }>(
    drive,
    TICKETS_VAULT_NAME,
    TICKETS_VAULT_KIND,
  );
  return raw?.tickets ?? [];
}
