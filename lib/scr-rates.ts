import { LISTED_POSITIONS } from "./craft-labor.ts";
import { lookupShahanLabor, uniqueSortedTitles } from "./shahan-wood-river.ts";
import { wageLookupOpts, wageLookupPositions } from "./wage-lookup.ts";

/** Job-pack / Rate Vault / plant-book composite ST/OT/DT. Do not invent rates. */
export function scrCompositeRates(craft: string, site = "", client = "") {
  const title = craft.trim();
  if (!title) return { st: 0, ot: 0, dt: 0 };
  const fromBook = wageLookupPositions(site, client).find((row) => row.title === title);
  if (fromBook && (Number(fromBook.st) || Number(fromBook.ot) || Number(fromBook.dt))) {
    return {
      st: Math.max(0, Number(fromBook.st) || 0),
      ot: Math.max(0, Number(fromBook.ot) || 0),
      dt: Math.max(0, Number(fromBook.dt) || 0),
    };
  }
  const row = lookupShahanLabor(title, wageLookupOpts(site));
  return {
    st: Math.max(0, Number(row?.st) || 0),
    ot: Math.max(0, Number(row?.ot) || 0),
    dt: Math.max(0, Number(row?.dt) || 0),
  };
}

export function scrCraftOptions(site = "", client = "", extra: readonly string[] = []) {
  const book = wageLookupPositions(site, client).map((row) => row.title);
  const listed = book.length ? book : [...LISTED_POSITIONS];
  return uniqueSortedTitles([...listed, ...extra]);
}
