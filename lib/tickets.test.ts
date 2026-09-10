import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import {
  TICKETS_VAULT_WRITE_ERROR,
  ticketsForViewer,
  ticketsVaultLeaks,
  ticketsVaultStored,
} from "./ticket-cache.ts";
import { canUseSuggestionBox } from "./inbox-circle.ts";
import {
  addStoredTicket,
  forgetTicketCacheForTests,
  listStoredTickets,
  mergeStoredTickets,
  removeStoredTicket,
  resetTicketStoreForTests,
  staleWarmTicketInstanceForTests,
  ticketStoreKind,
  ticketsRequireDrive,
  ticketsStored,
  useTicketVaultForTests,
} from "./ticket-store.ts";
import {
  TICKETS_VAULT_FILE_ID,
  TICKETS_VAULT_KIND,
  TICKETS_VAULT_NAME,
  findVaultJsonFile,
  readVaultJson,
  resetVaultFileIdsForTests,
} from "./drive-data.ts";
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

  it("hydrate treats the vault as source of truth and does not promote /tmp leftovers", async () => {
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
    assert.equal(listed.some((row) => row.id === chance.id), false);
    const vault = await readVaultTickets(drive);
    assert.equal(vault.some((row) => row.id === chance.id), false);
  });

  it("fails closed when Drive is missing and does not advertise a local ticket as saved", async () => {
    resetTicketStoreForTests();
    useTicketVaultForTests(null);
    assert.equal(ticketsRequireDrive(), true);
    assert.equal(ticketStoreKind(), "none");
    assert.equal(ticketsStored(), false);
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
      (error: unknown) => error instanceof Error && error.message === TICKETS_VAULT_WRITE_ERROR,
    );
    assert.deepEqual(await listStoredTickets(), []);
  });

  it("fails closed on Vercel /tmp — that path is not a successful save", async () => {
    const prev = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      resetTicketStoreForTests();
      useTicketVaultForTests(null);
      assert.equal(ticketStoreKind(), "tmp-cache");
      assert.equal(ticketsStored(), false);
      await assert.rejects(
        () =>
          addStoredTicket(
            makeTicket({
              kind: "Broke",
              note: "tmp is not the vault",
              capture: null,
              later: false,
              who: "marks544@yahoo.com",
            }),
          ),
        /tickets vault/,
      );
      assert.deepEqual(await listStoredTickets(), []);
    } finally {
      if (prev == null) delete process.env.VERCEL;
      else process.env.VERCEL = prev;
    }
  });

  it("fails closed when the Drive write is not confirmed", async () => {
    const drive = memoryDrive();
    resetTicketStoreForTests();
    useTicketVaultForTests({
      ...drive,
      configured: true,
      async updateJson() {
        return { id: TICKETS_VAULT_FILE_ID, name: TICKETS_VAULT_NAME };
      },
      async confirmWrite() {
        return false;
      },
      async readJson() {
        return "{}";
      },
    });
    await assert.rejects(
      () =>
        addStoredTicket(
          makeTicket({
            kind: "Broke",
            note: "unconfirmed",
            capture: null,
            later: false,
            who: "chancec318@yahoo.com",
          }),
        ),
      /not confirmed|tickets vault|update/,
    );
    assert.equal((await listStoredTickets()).length, 0);
  });

  it("PATCHes the known tickets.json id so a redeploy still loads tester tickets", async () => {
    resetVaultFileIdsForTests();
    const drive = memoryDrive();
    resetTicketStoreForTests();
    useTicketVaultForTests(drive);
    const chance = await addStoredTicket(
      makeTicket({
        kind: "better way",
        note: "Chance after republish",
        capture: null,
        later: false,
        who: "chancec318@yahoo.com",
      }),
    );
    const found = await findVaultJsonFile(drive, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND);
    assert.equal(found?.id, TICKETS_VAULT_FILE_ID);
    forgetTicketCacheForTests();
    useTicketVaultForTests(drive);
    const again = await listStoredTickets("chancec318@yahoo.com");
    assert.equal(again.length, 1);
    assert.equal(again[0].id, chance.id);
    assert.equal((await listStoredTickets("marks544@yahoo.com")).length, 0);
    assert.equal(ticketsVaultLeaks({ tickets: again, store: "drive" }), false);
  });

  it("does not open Suggestion Box to Mark; Chance can file; owner sees all", async () => {
    assert.equal(canUseSuggestionBox({ email: "marks544@yahoo.com" }), false);
    assert.equal(canUseSuggestionBox({ email: "chancec318@yahoo.com" }), true);
    const drive = memoryDrive();
    resetTicketStoreForTests();
    useTicketVaultForTests(drive);
    const chance = await addStoredTicket(
      makeTicket({
        kind: "Broke",
        note: "Chance only",
        capture: null,
        later: false,
        who: "chancec318@yahoo.com",
      }),
    );
    const mark = await addStoredTicket(
      makeTicket({
        kind: "other",
        note: "Mark leftover",
        capture: null,
        later: false,
        who: "marks544@yahoo.com",
      }),
    );
    assert.deepEqual(
      (await listStoredTickets("chancec318@yahoo.com")).map((row) => row.id),
      [chance.id],
    );
    assert.deepEqual((await listStoredTickets("marks544@yahoo.com")).map((row) => row.id), [mark.id]);
    assert.equal((await listStoredTickets()).length, 2);
    const route = readFileSync(fileURLToPath(new URL("../app/api/desk/tickets/route.ts", import.meta.url)), "utf8");
    assert.match(route, /canUseSuggestionBox/);
    assert.match(route, /TICKETS_VAULT_WRITE_ERROR/);
    assert.match(route, /stored: ticketsStored/);
    const fabs = readFileSync(fileURLToPath(new URL("../components/DeskFabs.tsx", import.meta.url)), "utf8");
    assert.match(fabs, /ticketsVaultStored/);
    assert.match(fabs, /TICKETS_VAULT_WRITE_ERROR/);
    assert.doesNotMatch(fabs, /rememberTicket\(email, filed\);\s*announceTicketsChanged/);
    const desk = readFileSync(fileURLToPath(new URL("../components/TicketsDesk.tsx", import.meta.url)), "utf8");
    assert.match(desk, /TICKET_UNVAULTED_MARK/);
    assert.match(desk, /ticketsVaultStored/);
    assert.equal(ticketsVaultStored("drive", true), true);
    assert.equal(ticketsVaultStored("tmp-cache", true), false);
    assert.equal(ticketsVaultStored("server-json-file", true), true);
    assert.equal(ticketsVaultStored("drive", false), false);
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
