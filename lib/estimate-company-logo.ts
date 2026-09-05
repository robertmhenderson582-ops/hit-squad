/**
 * Live company-record logo for the Excel client package.
 * Same inference + companyLogoSrc rules as the Company Desk door.
 * Never invents a mark. Empty / invalid / unloadable → null (no splash).
 */

import {
  canSeeCompany,
  companyLogoSrc,
  inferCompanyIdFromParts,
  type Company,
  type CompanyScope,
} from "./companies.ts";

export const COMPANY_LOGO_SPLASH_OPACITY = 0.15;

export type CompanyLogoSplash = {
  base64: string;
  extension: "png" | "jpeg" | "gif";
};

/** Estimate pack company → catalog logo src, or null if none on file. */
export function resolveEstimateCompanyLogo(
  client: string | undefined | null,
  site: string | undefined | null,
  companies: readonly Company[],
  scope?: CompanyScope | null,
): string | null {
  const id = inferCompanyIdFromParts(client, site);
  if (scope && !canSeeCompany(scope, id)) return null;
  const row = companies.find((company) => company.id === id);
  return companyLogoSrc(row?.logo);
}

export function companyLogoFromApiPayload(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("logo" in data)) return null;
  const logo = (data as { logo?: unknown }).logo;
  return typeof logo === "string" ? companyLogoSrc(logo) : null;
}

export async function prepareCompanyLogoSplash(src?: string | null): Promise<CompanyLogoSplash | null> {
  const loaded = await loadCompanyLogoBytes(src);
  if (!loaded) return null;
  try {
    const faded = await rasterizeFadedLogo(loaded.bytes, loaded.mime);
    if (faded) return faded;
    const extension = sniffImage(loaded.bytes) ?? extensionFromMime(loaded.mime);
    if (!extension) return null;
    return { base64: encodeBase64(loaded.bytes), extension };
  } catch {
    return null;
  }
}

async function loadCompanyLogoBytes(
  src?: string | null,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const resolved = companyLogoSrc(src);
  if (!resolved) return null;
  try {
    if (resolved.startsWith("data:")) return decodeDataImage(resolved);
    if (/^https?:\/\//i.test(resolved)) return fetchImageBytes(resolved);
    if (resolved.startsWith("/")) {
      const origin = typeof globalThis.location?.origin === "string" ? globalThis.location.origin : "";
      if (!origin) return null;
      return fetchImageBytes(`${origin}${resolved}`);
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.byteLength) return null;
  const header = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  const mime = header.startsWith("image/") ? header : mimeFromSniff(bytes) ?? "image/png";
  return { bytes, mime };
}

function decodeDataImage(src: string): { bytes: Uint8Array; mime: string } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/]+=*)$/i.exec(src.trim());
  if (!match) return null;
  try {
    const bytes = decodeBase64(match[2]);
    if (!bytes.byteLength) return null;
    return { bytes, mime: match[1].toLowerCase() };
  } catch {
    return null;
  }
}

async function rasterizeFadedLogo(bytes: Uint8Array, mime: string): Promise<CompanyLogoSplash | null> {
  if (typeof document === "undefined") return null;
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const blob = new Blob([copy], { type: mime.startsWith("image/") ? mime : "image/png" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("logo-image"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 2000;
    canvas.height = 1400;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const maxW = canvas.width * 0.55;
    const maxH = canvas.height * 0.55;
    const naturalW = Math.max(1, img.naturalWidth || img.width);
    const naturalH = Math.max(1, img.naturalHeight || img.height);
    const scale = Math.min(maxW / naturalW, maxH / naturalH, 1);
    const drawW = naturalW * scale;
    const drawH = naturalH * scale;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = COMPANY_LOGO_SPLASH_OPACITY;
    ctx.drawImage(img, (canvas.width - drawW) / 2, (canvas.height - drawH) / 2, drawW, drawH);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!out) return null;
    return { base64: encodeBase64(new Uint8Array(await out.arrayBuffer())), extension: "png" };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function extensionFromMime(mime: string): CompanyLogoSplash["extension"] | null {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpeg";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("png")) return "png";
  return null;
}

function sniffImage(bytes: Uint8Array): CompanyLogoSplash["extension"] | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "gif";
  }
  return null;
}

function mimeFromSniff(bytes: Uint8Array): string | null {
  const ext = sniffImage(bytes);
  if (ext === "png") return "image/png";
  if (ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  return null;
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(value, "base64"));
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let text = "";
  bytes.forEach((byte) => {
    text += String.fromCharCode(byte);
  });
  return btoa(text);
}
