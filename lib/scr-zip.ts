/**
 * Client-submittable SCR package: polished Excel + backup docs.
 * Same packet model on every site — filename is site / job / SCR # / Scope ID.
 */
import JSZip from "jszip";
import { parseFcrPacket, emptyFcrPacket, type FcrPacket } from "./change-order-packet.ts";
import { slugify } from "./estimate-pack.ts";
import { scrToXlsx, scrXlsxFilename, type ScrXlsxInput } from "./scr-xlsx.ts";

export const SCR_ZIP_EXPORT_ERROR = "Could not export the SCR package. Try again.";
export const SCR_ZIP_BACKUPS_FOLDER = "backups";

export type ScrZipAttachment = {
  name: string;
  bytes: Uint8Array | ArrayBuffer;
  scr?: string;
};

export type ScrZipInput = ScrXlsxInput & {
  attachments?: ScrZipAttachment[];
  scr?: string;
  scopeId?: string;
};

function packetOf(input: ScrZipInput): FcrPacket {
  return parseFcrPacket(input.packet ?? emptyFcrPacket());
}

function safeZipName(value: string) {
  const trimmed = value.replace(/\\/g, "/").split("/").pop()?.trim() || "";
  return trimmed.replace(/[^\w.\- ()]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

function identityOf(input: ScrZipInput) {
  const packet = packetOf(input);
  const selected = input.selectedId ? packet.log.find((row) => row.id === input.selectedId) : undefined;
  const row = selected || packet.log.find((item) => item.scr.trim()) || packet.log[0];
  return {
    scr: (input.scr || row?.scr || "").trim(),
    scopeId: (input.scopeId || row?.scopeId || "").trim(),
  };
}

export function scrZipFilename(input: ScrZipInput = {}) {
  const { scr, scopeId } = identityOf(input);
  const site = slugify((input.site || "").split("—")[0] || "");
  const job = slugify(input.title || "");
  const base = [site, job, slugify(scr), slugify(scopeId), "scr"].filter(Boolean).join("-") || "scr";
  return `${base}.zip`;
}

export function scrZipXlsxName(input: ScrZipInput = {}) {
  const { scr, scopeId } = identityOf(input);
  if (scr || scopeId) {
    const site = slugify((input.site || "").split("—")[0] || "");
    const job = slugify(input.title || "");
    const base = [site, job, slugify(scr), slugify(scopeId), "scr"].filter(Boolean).join("-") || "scr";
    return `${base}.xlsx`;
  }
  return scrXlsxFilename(input);
}

export function scrZipBackupPath(file: Pick<ScrZipAttachment, "name" | "scr">) {
  const folder = safeZipName(file.scr || "scr");
  return `${SCR_ZIP_BACKUPS_FOLDER}/${folder}/${safeZipName(file.name)}`;
}

export async function scrToZip(input: ScrZipInput = {}): Promise<Uint8Array> {
  const xlsx = await scrToXlsx(input);
  const zip = new JSZip();
  zip.file(scrZipXlsxName(input), xlsx);
  for (const file of input.attachments ?? []) {
    const name = (file.name || "").trim();
    if (!name || !file.bytes) continue;
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    if (!bytes.byteLength) continue;
    zip.file(scrZipBackupPath({ name, scr: file.scr }), bytes);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
