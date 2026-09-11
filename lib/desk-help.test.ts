import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { NOVUS_HELP_EMAIL, NOVUS_HELP_LABEL, NOVUS_HELP_MAILTO } from "./desk-help.ts";
import { NOVUS_EMAIL, OWNER_LOGIN_EMAIL } from "./desk-role.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("Novus help email on desk chrome", () => {
  it("lists the Novus desk Gmail once, not Robert or Madison mail", () => {
    assert.equal(NOVUS_HELP_EMAIL, "hitsquad.novus@gmail.com");
    assert.equal(NOVUS_HELP_MAILTO, "mailto:hitsquad.novus@gmail.com");
    assert.equal(NOVUS_HELP_LABEL, "Help / IT / bugs");
    assert.notEqual(NOVUS_HELP_EMAIL, OWNER_LOGIN_EMAIL);
    assert.notEqual(NOVUS_HELP_EMAIL, NOVUS_EMAIL);
    assert.equal(/madisonltd\.com/i.test(NOVUS_HELP_EMAIL), false);
    assert.equal(NOVUS_HELP_EMAIL.includes("robertmhenderson582"), false);
  });

  it("puts a mailto help strip on every desk shell, not Settings-only", () => {
    const help = source("../components/DeskHelpBar.tsx");
    const chrome = source("../components/DeskChrome.tsx");
    const workspace = source("../components/EstimateWorkspace.tsx");
    const login = source("../app/login/page.tsx");
    const display = source("../components/DisplayDesk.tsx");
    const css = source("../app/globals.css");

    assert.match(help, /NOVUS_HELP_EMAIL/);
    assert.match(help, /NOVUS_HELP_MAILTO/);
    assert.match(help, /NOVUS_HELP_LABEL/);
    assert.match(chrome, /<DeskHelpBar \/>/);
    assert.match(workspace, /<DeskHelpBar \/>/);
    assert.doesNotMatch(login, /DeskHelpBar/);
    assert.match(display, /NOVUS_HELP_EMAIL/);
    assert.doesNotMatch(display, /hitsquad\.novus@gmail\.com/);
    assert.match(css, /\.desk-help-bar \{/);
    assert.match(css, /\.desk-help-mail \{/);
    assert.match(css, /text-overflow: ellipsis;/);
    assert.match(css, /@media \(max-width: 640px\) \{[\s\S]{0,220}\.desk-help-bar \{/);
  });
});
