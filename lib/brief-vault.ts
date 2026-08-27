import { isOwner } from "./desk-role.ts";
import {
  briefDriveAdapter,
  listBriefsFromDrive,
  readBriefFile,
  responseLeaksBriefVault,
  saveBriefToDrive,
  type BriefDrive,
  type LandedBrief,
} from "./drive-briefs.ts";
import { checkLeadFiles, isLeadFile, isLeadKind, type LeadKind } from "./lead-briefs.ts";
import { emailOwnerNote } from "./ticket-mail.ts";
import type { PublicUser } from "./types.ts";

export type BriefUser = Pick<PublicUser, "email" | "name" | "role">;

export function briefVaultAdapter(adapter?: BriefDrive) {
  return adapter ?? briefDriveAdapter();
}

export function publicLandedBrief(brief: LandedBrief): LandedBrief {
  return {
    id: brief.id,
    kind: brief.kind,
    who: brief.who,
    whoName: brief.whoName,
    savedAt: brief.savedAt,
    describe: brief.describe,
    files: brief.files.map((file) => ({ name: file.name, type: file.type, id: file.id })),
  };
}

export async function saveUserBrief(
  user: BriefUser,
  incoming: { kind?: unknown; describe?: unknown; files?: unknown },
  adapter?: BriefDrive,
) {
  if (!isLeadKind(incoming.kind)) return { ok: false as const, status: 400, error: "Pick Quality or HSE." };
  const describe = typeof incoming.describe === "string" ? incoming.describe : "";
  const files = Array.isArray(incoming.files) ? incoming.files.filter(isLeadFile) : [];
  const check = checkLeadFiles(files);
  if (!check.ok) return { ok: false as const, status: 400, error: check.error };
  const drive = briefVaultAdapter(adapter);
  if (!drive.configured) {
    return {
      ok: true as const,
      stored: false,
      store: "unconfigured" as const,
      kind: incoming.kind,
    };
  }
  const brief = await saveBriefToDrive(drive, {
    kind: incoming.kind,
    who: user.email,
    whoName: user.name,
    describe,
    files,
  });
  void emailOwnerNote(
    `Hit Squad brief · ${incoming.kind} · ${user.email}`,
    [
      `Kind: ${incoming.kind}`,
      `Who: ${user.name} · ${user.email}`,
      `When: ${brief.savedAt}`,
      `Files: ${brief.files.map((file) => file.name).join(", ") || "none"}`,
      "",
      describe || "(no description)",
      "",
      "Hit Squad brief copy. Not Inbox.",
    ].join("\n"),
  );
  return { ok: true as const, stored: true, store: "drive" as const, brief: publicLandedBrief(brief) };
}

export async function listVisibleBriefs(user: BriefUser, kind: LeadKind, adapter?: BriefDrive) {
  const drive = briefVaultAdapter(adapter);
  const store = drive.configured ? "drive" : "unconfigured";
  if (!isOwner(user) || !drive.configured) return { briefs: [] as LandedBrief[], store };
  const briefs = (await listBriefsFromDrive(drive, kind)).map(publicLandedBrief);
  return { briefs, store };
}

export async function getVisibleBriefFile(user: BriefUser, fileId: string, adapter?: BriefDrive) {
  if (!isOwner(user) || !fileId) return null;
  const drive = briefVaultAdapter(adapter);
  if (!drive.configured) return null;
  return readBriefFile(drive, fileId);
}

export function briefsResponse(user: BriefUser, briefs: LandedBrief[], store: string) {
  const body: { briefs: LandedBrief[]; store?: string } = {
    briefs: isOwner(user) ? briefs.map(publicLandedBrief) : [],
  };
  if (isOwner(user)) body.store = store;
  return body;
}

export function saveBriefResponse(
  user: BriefUser,
  result: { stored: boolean; store: string; brief?: LandedBrief },
) {
  const body: { ok: true; stored: boolean; store?: string; brief?: LandedBrief } = {
    ok: true,
    stored: result.stored,
  };
  if (isOwner(user)) {
    body.store = result.store;
    if (result.brief) body.brief = publicLandedBrief(result.brief);
  }
  return body;
}

export function briefsLeak(payload: unknown) {
  return responseLeaksBriefVault(payload);
}
