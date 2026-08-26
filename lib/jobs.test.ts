import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deskForUser } from "./jobs.ts";

describe("desk counts", () => {
  it("counts real estimates, not every open job", () => {
    const desk = deskForUser("owner-robert-henderson");
    assert.equal(desk.jobs.length, 4);
    assert.equal(desk.jobs.some((job) => job.kind === "hse"), true);
    assert.equal(desk.estimatesOpen, 3);
    assert.equal(desk.estimatesOpen === desk.jobs.length, false);
  });
});
