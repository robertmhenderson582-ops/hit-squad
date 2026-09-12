/**
 * Nightly deep-audit registry (Robert 2026-09-12).
 *
 * Every ship that persists desk / vault / listing state MUST be auditable here.
 * Add `lib/<feature>-audit.test.ts` for the new surface, then list that file in
 * package.json `test`. This registry fails if an audit file is missing from
 * the nightly command.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const REQUIRED_AUDIT_FILES = ["quality-template-form-audit.test.ts"] as const;

describe("Nightly deep audit registry", () => {
  it("runs every lib/*-audit.test.ts from package.json test", () => {
    const libDir = fileURLToPath(new URL(".", import.meta.url));
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as {
      scripts?: { test?: string };
    };
    const testScript = pkg.scripts?.test || "";
    const auditFiles = readdirSync(libDir).filter((name) => name.endsWith("-audit.test.ts"));
    assert.ok(auditFiles.length > 0, "Nightly deep audit has no lib/*-audit.test.ts entries.");
    for (const name of REQUIRED_AUDIT_FILES) {
      assert.ok(auditFiles.includes(name), `Required audit ${name} is missing.`);
    }
    for (const name of auditFiles) {
      assert.match(
        testScript,
        new RegExp(`lib/${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
        `${name} must stay in package.json test so nightly can run it.`,
      );
    }
    assert.match(testScript, /nightly-deep-audit\.test\.ts/);
  });
});
