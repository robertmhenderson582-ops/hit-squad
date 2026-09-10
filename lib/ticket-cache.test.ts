import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  TICKET_UNVAULTED_MARK,
  hydrateTickets,
  mergeTickets,
  mergeVaultedTickets,
  rememberTicket,
  ticketCacheKey,
  ticketsVaultStored,
} from "./ticket-cache.ts";
import { makeTicket, type DeskTicket } from "./tickets.ts";

const memory = new Map<string, string>();

const localStorage = {
  getItem(key: string) {
    return memory.has(key) ? memory.get(key)! : null;
  },
  setItem(key: string, value: string) {
    memory.set(key, value);
  },
  removeItem(key: string) {
    memory.delete(key);
  },
};

Object.defineProperty(globalThis, "window", {
  value: { localStorage },
  configurable: true,
});

const OWNER = "robertmhenderson582@gmail.com";
const TESTER = "josephmhenderson2002@gmail.com";

function ticket(who: string, note: string, id?: string): DeskTicket {
  return makeTicket({
    id,
    kind: "Broke",
    note,
    capture: null,
    later: false,
    who,
  });
}

beforeEach(() => {
  memory.clear();
});

describe("ticket cache merge", () => {
  it("does not replace a longer local list with a shorter server list", () => {
    const a = ticket(OWNER, "one", "tkt-a");
    const b = ticket(OWNER, "two", "tkt-b");
    const c = ticket(OWNER, "three", "tkt-c");
    const merged = mergeTickets([c], [a, b, c]);
    assert.equal(merged.length, 3);
    assert.deepEqual(
      merged.map((row) => row.id).sort(),
      ["tkt-a", "tkt-b", "tkt-c"],
    );
  });

  it("keeps the richer capture and note when the same id is on both sides", () => {
    const bare = { ...ticket(OWNER, "", "tkt-same"), capture: null };
    const rich = { ...ticket(OWNER, "clock did not add", "tkt-same"), capture: "data:image/jpeg;base64,xx" };
    const merged = mergeTickets([bare], [rich]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].note, "clock did not add");
    assert.equal(merged[0].capture, rich.capture);
  });

  it("confirmed hydrate marks leftover local tickets unvaulted and does not persist them as saved", () => {
    rememberTicket(OWNER, ticket(OWNER, "first", "tkt-1"));
    rememberTicket(OWNER, ticket(OWNER, "second", "tkt-2"));
    rememberTicket(OWNER, ticket(OWNER, "third", "tkt-3"));
    const shown = hydrateTickets([ticket(OWNER, "third", "tkt-3")], OWNER, true, {
      store: "drive",
      stored: true,
    });
    assert.equal(shown.length, 3);
    assert.equal(shown.find((row) => row.id === "tkt-3")?.vaulted, true);
    assert.equal(shown.find((row) => row.id === "tkt-1")?.vaulted, false);
    assert.match(TICKET_UNVAULTED_MARK, /on this desk only/);
    const raw = JSON.parse(memory.get(ticketCacheKey(OWNER)) || "{}") as { tickets?: DeskTicket[] };
    assert.deepEqual(
      raw.tickets?.map((row) => row.id),
      ["tkt-3"],
    );
  });

  it("unconfirmed hydrate does not treat local leftovers as saved", () => {
    rememberTicket(OWNER, ticket(OWNER, "already there", "tkt-keep"));
    const filed = ticket(OWNER, "just filed", "tkt-new");
    const shown = hydrateTickets([filed], OWNER, true, { store: "tmp-cache", stored: false });
    assert.equal(shown.every((row) => row.vaulted === false), true);
    assert.equal(ticketsVaultStored("tmp-cache", true), false);
    assert.equal(mergeVaultedTickets([filed], [ticket(OWNER, "keep", "tkt-keep")]).map((row) => `${row.id}:${row.vaulted}`).join(), "tkt-new:true,tkt-keep:false");
  });

  it("testers still only see their own tickets after a merge", () => {
    rememberTicket(TESTER, ticket(TESTER, "mine", "tkt-joe"));
    const shown = hydrateTickets(
      [ticket(TESTER, "mine", "tkt-joe"), ticket(OWNER, "owner row", "tkt-owner")],
      TESTER,
      false,
      { store: "drive", stored: true },
    );
    assert.equal(shown.length, 1);
    assert.equal(shown[0].id, "tkt-joe");
    assert.equal(shown[0].vaulted, true);
  });
});
