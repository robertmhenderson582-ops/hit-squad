import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("HUD A BrandMark", () => {
  it("locks one cyan/amber reticle and drops chase jets everywhere the mark is used", () => {
    const mark = source("../components/BrandMark.tsx");
    const favicon = source("../app/icon.svg");
    const hero = source("../components/DeskHero.tsx");
    const wordmark = source("../components/Wordmark.tsx");
    const chrome = source("../components/DeskChrome.tsx");
    const workspace = source("../components/EstimateWorkspace.tsx");

    assert.match(mark, /data-brand-mark="hud-a"/);
    assert.match(mark, /Locked HUD A reticle/);
    assert.match(mark, /#3ec6d4/);
    assert.match(mark, /#0f5f6d/);
    assert.match(mark, /#e38b2a/);
    assert.match(mark, /M7 19\.5V7h12\.5M60\.5 7H73v12\.5/);
    assert.match(mark, /M68\.4 40 62\.2 36\.7v6\.6Z/);
    assert.match(mark, /A21\.5 21\.5 0 0 1/);
    assert.doesNotMatch(mark, /jets|JET |variant === "stacked"|variant === "jets"/);
    assert.doesNotMatch(mark, /translate\(48 4\)|translate\(4 34\)|viewBox="0 0 100 72"/);
    assert.doesNotMatch(mark, /Madison|madison/);
    assert.doesNotMatch(mark, /rotate\(45 40 40\)/);

    assert.match(favicon, /#0f5f6d/);
    assert.match(favicon, /#3ec6d4/);
    assert.match(favicon, /#e38b2a/);
    assert.match(favicon, /M7 19\.5V7h12\.5/);
    assert.doesNotMatch(favicon, /rotate\(45 40 40\)/);

    for (const file of [hero, wordmark, chrome, workspace]) {
      assert.match(file, /<BrandMark /);
      assert.doesNotMatch(file, /variant="stacked"|variant="jets"/);
    }
    assert.match(chrome, /home-title-mark/);
    assert.match(hero, /className="mx-auto h-14 w-14"/);
    assert.match(chrome, /className="h-8 w-8 shrink-0"/);
  });
});
