import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  hydrateTickets,
  mergeTickets,
  rememberTicket,
  ticketCacheKey,
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

  it("owner hydrate keeps local tickets when the server list is shorter", () => {
    const first = rememberTicket(OWNER, ticket(OWNER, "first", "tkt-1"));
    assert.equal(first.length, 1);
    rememberTicket(OWNER, ticket(OWNER, "second", "tkt-2"));
    rememberTicket(OWNER, ticket(OWNER, "third", "tkt-3"));
    const shown = hydrateTickets([ticket(OWNER, "third", "tkt-3")], OWNER, true);
    assert.equal(shown.length, 3);
    assert.deepEqual(
      shown.map((row) => row.id).sort(),
      ["tkt-1", "tkt-2", "tkt-3"],
    );
    const raw = JSON.parse(memory.get(ticketCacheKey(OWNER)) || "{}") as { tickets?: DeskTicket[] };
    assert.equal(raw.tickets?.length, 3);
  });

  it("remember then merge does not drop existing tickets", () => {
    rememberTicket(OWNER, ticket(OWNER, "already there", "tkt-keep"));
    const filed = ticket(OWNER, "just filed", "tkt-new");
    const afterSubmit = rememberTicket(OWNER, filed);
    assert.equal(afterSubmit.length, 2);
    const afterServer = hydrateTickets([filed], OWNER, true);
    assert.equal(afterServer.length, 2);
    assert.equal(afterServer.some((row) => row.id === "tkt-keep"), true);
    assert.equal(afterServer.some((row) => row.id === "tkt-new"), true);
  });

  it("testers still only see their own tickets after a merge", () => {
    rememberTicket(TESTER, ticket(TESTER, "mine", "tkt-joe"));
    const shown = hydrateTickets(
      [ticket(TESTER, "mine", "tkt-joe"), ticket(OWNER, "owner row", "tkt-owner")],
      TESTER,
      false,
    );
    assert.equal(shown.length, 1);
    assert.equal(shown[0].id, "tkt-joe");
  });
});
