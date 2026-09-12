/** Client-safe vault listing ACL. Hide site plumbing from non-Owner seats. */

import { isOwner } from "./desk-role.ts";

export type VaultListViewer = { role?: string } | null | undefined;

/** Known site-JSON / key files. All `*.json` is also infra — this set is the explicit lock. */
export const VAULT_SITE_JSON_NAMES = [
  "tickets.json",
  "seats.json",
  "inbox.json",
  "companies.json",
  "activity.json",
  "settings.json",
  "rates.json",
  "quality-briefs.json",
  "hse-briefs.json",
  "privileges.json",
  "positions.json",
  "quality-library.lock.json",
  "hse-library.lock.json",
] as const;

/** Human program docs users drop or fill — HSE / Quality / estimate packs. */
const USER_PROGRAM_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "xlsm",
  "xlsb",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "txt",
  "zip",
]);

function vaultFileBaseName(name?: string | null) {
  return (name || "").replace(/\\/g, "/").split("/").pop()?.trim() || "";
}

function vaultFileExtension(name: string) {
  const base = vaultFileBaseName(name);
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Site plumbing / website guts. Fail closed: unknown names are infrastructure.
 * Does not delete Drive files — list/render/API filter only.
 */
export function isVaultInfrastructureFile(
  file?: string | { name?: string | null; type?: string | null } | null,
): boolean {
  const name = typeof file === "string" ? file : file?.name;
  const type = typeof file === "string" ? "" : (file?.type || "").split(";")[0].trim().toLowerCase();
  const base = vaultFileBaseName(name);
  if (!base) return true;
  const lower = base.toLowerCase();
  if ((VAULT_SITE_JSON_NAMES as readonly string[]).includes(lower)) return true;
  if (lower.endsWith(".json") || lower.endsWith(".lock")) return true;
  if (lower.includes("_meta")) return true;
  if (lower.startsWith(".") || lower.startsWith("_")) return true;
  if (/(^|[._-])(acl|key|pem|secret|credentials?)(\.|$)/i.test(lower)) return true;
  if (type === "application/json" || type.endsWith("+json")) return true;
  const ext = vaultFileExtension(lower);
  if (!ext) return true;
  return !USER_PROGRAM_EXTENSIONS.has(ext);
}

/** View-as another seat is never Owner diagnostics — fail closed. */
export function vaultListViewerForSeat(
  user?: VaultListViewer,
  viewAs?: string | null,
): VaultListViewer {
  if (viewAs && viewAs !== "owner") return { role: "tester" };
  return user ?? null;
}

export function vaultFileVisibleToViewer(
  file?: string | { name?: string | null; type?: string | null } | null,
  viewer?: VaultListViewer,
): boolean {
  if (isOwner(viewer)) return true;
  return !isVaultInfrastructureFile(file);
}

export function filterVaultListedFiles<T extends { name?: string | null; type?: string | null }>(
  files: readonly T[] | null | undefined,
  viewer?: VaultListViewer,
): T[] {
  return (files ?? []).filter((file) => vaultFileVisibleToViewer(file, viewer));
}

export function filterVaultTreeForViewer<T extends { path: string[]; files: string[] }>(
  rows: readonly T[] | null | undefined,
  viewer?: VaultListViewer,
): T[] {
  return (rows ?? [])
    .map((row) => ({
      ...row,
      files: row.files.filter((name) => vaultFileVisibleToViewer(name, viewer)),
    }))
    .filter((row) => row.files.length > 0);
}

export function filterVaultBriefsForViewer<T extends { files?: Array<{ name?: string; type?: string }> }>(
  briefs: readonly T[] | null | undefined,
  viewer?: VaultListViewer,
): T[] {
  return (briefs ?? []).map((brief) => ({
    ...brief,
    files: filterVaultListedFiles(brief.files ?? [], viewer),
  }));
}

export function filterVaultFilesByFolder<T extends { name?: string | null; type?: string | null }>(
  filesByFolder: Record<string, T[]> | null | undefined,
  viewer?: VaultListViewer,
): Record<string, T[]> {
  return Object.fromEntries(
    Object.entries(filesByFolder ?? {}).map(([id, files]) => [id, filterVaultListedFiles(files, viewer)]),
  );
}
