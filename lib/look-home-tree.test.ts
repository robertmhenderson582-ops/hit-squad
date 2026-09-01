import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

describe("home tree look batch", () => {
  it("keeps Inbox off the estimate toolbar and unread contrast off the trial orange", () => {
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");
    assert.equal(/InboxBadge/.test(workspace), false);
    assert.match(workspace, /title=\{item\.label\}/);
    assert.match(css, /teal-pulse/);
    assert.match(css, /\.inbox-fab-pulse \{\n  animation: teal-pulse 1\.4s ease-out infinite;\n  background: #0f5f6d;/);
    assert.match(css, /\.inbox-header-badge \{\n  border-radius: 999px;\n  background: #0f5f6d;/);
    assert.match(css, /\.trial-banner \{[\s\S]*#e38b2a/);
  });
});
