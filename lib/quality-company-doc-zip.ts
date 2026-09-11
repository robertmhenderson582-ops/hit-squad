import JSZip from "jszip";
import {
  qualityCompanyDocFileName,
  qualityCompanyDocPreviewType,
  qualityCompanyDocViewKind,
  type QualityCompanyDocViewKind,
} from "./quality-company-docs.ts";

export type QualityCompanyDocZipMember = {
  path: string;
  name: string;
  kind: QualityCompanyDocViewKind;
};

export type QualityCompanyDocZipFile = {
  name: string;
  type: string;
  data: string;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function qualityCompanyDocZipMemberPath(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").trim();
}

export function isQualityCompanyDocZipJunk(path: string, dir?: boolean) {
  const norm = qualityCompanyDocZipMemberPath(path);
  if (!norm || dir || path.replace(/\\/g, "/").endsWith("/")) return true;
  return norm.split("/").some((part) => part === "__MACOSX");
}

export function qualityCompanyDocZipMemberType(name: string) {
  const kind = qualityCompanyDocViewKind({ name });
  if (kind === "office") {
    if (name.toLowerCase().endsWith(".docx")) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    if (name.toLowerCase().endsWith(".xlsx")) {
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
  }
  return qualityCompanyDocPreviewType({ name });
}

export function listQualityCompanyDocZipMembers(
  entries: Array<{ name?: string; dir?: boolean }>,
): QualityCompanyDocZipMember[] {
  return entries
    .map((entry) => ({
      path: qualityCompanyDocZipMemberPath(entry.name),
      dir: entry.dir,
      raw: entry.name || "",
    }))
    .filter((entry) => entry.path && !isQualityCompanyDocZipJunk(entry.raw || entry.path, entry.dir))
    .map((entry) => ({
      path: entry.path,
      name: entry.path,
      kind: qualityCompanyDocViewKind({ name: entry.path }),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export async function readQualityCompanyDocZipMembers(bytes: Uint8Array | ArrayBuffer) {
  const zip = await JSZip.loadAsync(bytes);
  return listQualityCompanyDocZipMembers(
    Object.keys(zip.files).map((name) => ({ name, dir: zip.files[name]?.dir })),
  );
}

export async function pickQualityCompanyDocZipMember(
  bytes: Uint8Array | ArrayBuffer,
  memberPath: string,
): Promise<QualityCompanyDocZipFile | null> {
  const wanted = qualityCompanyDocZipMemberPath(memberPath);
  if (!wanted || isQualityCompanyDocZipJunk(wanted)) return null;
  const zip = await JSZip.loadAsync(bytes);
  const entry =
    zip.file(wanted) ||
    zip.file(memberPath) ||
    Object.values(zip.files).find((file) => qualityCompanyDocZipMemberPath(file.name) === wanted);
  if (!entry || entry.dir) return null;
  const data = await entry.async("uint8array");
  const name = qualityCompanyDocFileName(wanted) || wanted;
  return {
    name,
    type: qualityCompanyDocZipMemberType(wanted),
    data: bytesToBase64(data),
  };
}
