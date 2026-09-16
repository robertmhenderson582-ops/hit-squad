import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  clearJobTreeExpand,
  emptyJobTreeExpand,
  JOB_TREE_EXPAND_KEY,
  parseJobTreeExpand,
  readJobTreeExpand,
  writeJobTreeExpand,
} from "./job-tree-session.ts";

function memoryStore(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    getItem(key: string) {
      return key in data ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    removeItem(key: string) {
      delete data[key];
    },
  };
}

describe("jobs tree session expand", () => {
  it("remembers company / site expand for the signed-in seat and resets on logout", () => {
    const store = memoryStore();
    const start = readJobTreeExpand(store, "nathanboyte@gmail.com");
    assert.deepEqual(start, emptyJobTreeExpand("nathanboyte@gmail.com"));
    writeJobTreeExpand(store, {
      email: "nathanboyte@gmail.com",
      openCompanyId: "madison",
      collapsedSites: ["open:madison:site-madison"],
      collapsedClients: ["open:madison:client:phillips-66"],
    });
    const saved = readJobTreeExpand(store, "nathanboyte@gmail.com");
    assert.equal(saved.openCompanyId, "madison");
    assert.deepEqual(saved.collapsedSites, ["open:madison:site-madison"]);
    assert.deepEqual(saved.collapsedClients, ["open:madison:client:phillips-66"]);
    assert.equal(readJobTreeExpand(store, "wlanderno@yahoo.com").openCompanyId, "");
    writeJobTreeExpand(store, { email: "nathanboyte@gmail.com", openCompanyId: "" });
    assert.equal(readJobTreeExpand(store, "nathanboyte@gmail.com").collapsedSites.length, 1);
    clearJobTreeExpand(store);
    assert.equal(store.getItem(JOB_TREE_EXPAND_KEY), null);
    assert.equal(readJobTreeExpand(store, "nathanboyte@gmail.com").openCompanyId, "");
    assert.equal(parseJobTreeExpand({ email: "other", openCompanyId: "madison" }, "nathanboyte@gmail.com").openCompanyId, "");
  });

  it("wires Jobs + logout to sessionStorage, not a permanent device vault", () => {
    const jobs = readFileSync(fileURLToPath(new URL("../components/JobsDesk.tsx", import.meta.url)), "utf8");
    const tree = readFileSync(fileURLToPath(new URL("../components/JobTreeDesk.tsx", import.meta.url)), "utf8");
    const session = readFileSync(fileURLToPath(new URL("../components/SessionProvider.tsx", import.meta.url)), "utf8");
    const lib = readFileSync(fileURLToPath(new URL("./job-tree-session.ts", import.meta.url)), "utf8");
    assert.match(jobs, /writeJobTreeExpand/);
    assert.match(jobs, /readJobTreeExpand/);
    assert.match(tree, /writeJobTreeExpand/);
    assert.match(session, /clearJobTreeExpand/);
    assert.match(session, /signIn/);
    assert.match(lib, /hs_jobs_tree_expand_v1/);
    assert.match(lib, /sessionStorage/);
    assert.equal(/localStorage\.setItem\(JOB_TREE_EXPAND_KEY/.test(jobs + tree + lib), false);
  });
});
