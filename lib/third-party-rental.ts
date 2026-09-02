/**
 * Madison Wood River third-party rental book.
 * Source: Wood River Rate Tables sheet block "Third Party Equipment Rental"
 * (Nathan CAT 2 / Wood River TM estimate Rate Tables).
 *
 * Titles + dollars only. Not Shahan COMP wet/dry large tools.
 * Not COE Rental. Skip Empty / Need Quote crane-tech rows.
 * Books stay in Drive. Never commit the xlsx / P66 / Madison workbooks.
 */

export const WOOD_RIVER_THIRD_PARTY_BOOK_LABEL = "Wood River third-party table";
export type ThirdPartyRentalPeriod = "daily" | "weekly" | "monthly";

export type ThirdPartyRentalRow = {
  description: string;
  daily: number | null;
  weekly: number | null;
  monthly: number | null;
  freight: number;
};

/** Live third-party rental catalog. Exact sheet dollars. Do not invent. 0 / null = no rate for that period. */
export const WOOD_RIVER_THIRD_PARTY_RENTAL: ThirdPartyRentalRow[] = [
  { description: "6 pack Stick/Tig / Mig", daily: 37.5, weekly: 187.5, monthly: 750, freight: 50 },
  { description: "6 pack Stick/Tig / Mig pulse", daily: 61.25, weekly: 306.24, monthly: 1225, freight: 50 },
  { description: "LN 25 Mig guns", daily: 0, weekly: 0, monthly: 225, freight: 50 },
  { description: "450amp diesel welder", daily: 134, weekly: 310, monthly: 627, freight: 100 },
  { description: "PMX 85 Plasma", daily: 0, weekly: 0, monthly: 565, freight: 50 },
  { description: "PMX 105 Plasma", daily: 0, weekly: 0, monthly: 895, freight: 50 },
  { description: "Pipe B B 500", daily: 0, weekly: 0, monthly: 460, freight: 50 },
  { description: "535 pipe threader", daily: 150, weekly: 340, monthly: 801, freight: 50 },
  { description: "53 ft weld test trailer", daily: 0, weekly: 0, monthly: 6500, freight: 250 },
  { description: "Flume extractor", daily: 0, weekly: 0, monthly: 512, freight: 50 },
  { description: "Bus", daily: 0, weekly: 0, monthly: 3000, freight: 250 },
  { description: "Flatbed trailers Standard", daily: 0, weekly: 0, monthly: 600, freight: 200 },
  { description: "Extendable flatbed", daily: 0, weekly: 0, monthly: 1000, freight: 200 },
  { description: "Drop deck", daily: 0, weekly: 0, monthly: 800, freight: 200 },
  { description: "15 ton Carry deck", daily: 864, weekly: 2199, monthly: 5142, freight: 50 },
  { description: "Air blower 20\" Pnematic", daily: 28.41, weekly: 91.22, monthly: 260.45, freight: 25 },
  { description: "Air Reciever 240 gallon", daily: 53.29, weekly: 156.69, monthly: 483.92, freight: 50 },
  { description: "Air Reciever 620 gallon", daily: 127.23, weekly: 282.74, monthly: 673.2, freight: 50 },
  { description: "8\" electric blower", daily: 94.87, weekly: 276.07, monthly: 826.07, freight: 25 },
  { description: "60ft JLG", daily: 405, weekly: 1003.5, monthly: 2256, freight: 200 },
  { description: "80ft JLG", daily: 815, weekly: 1881, monthly: 4124, freight: 200 },
  { description: "Bull Hose", daily: 48, weekly: 118, monthly: 244, freight: 25 },
  { description: "1600 air compressor", daily: 1412, weekly: 4500, monthly: 9730, freight: 200 },
  { description: "185 air compressor", daily: 210, weekly: 637, monthly: 1311, freight: 50 },
  { description: "Skip Pan", daily: 120, weekly: 258, monthly: 847, freight: 100 },
  { description: "10K fork lift", daily: 628, weekly: 628, monthly: 3648, freight: 250 },
  { description: "6K forklift", daily: 628, weekly: 1074, monthly: 3648, freight: 250 },
  { description: "Sissor Lift", daily: 141, weekly: 298, monthly: 417, freight: 250 },
  { description: "Fuel Tank", daily: 75, weekly: 160, monthly: 550, freight: 100 },
  { description: "Stake Bed Truck", daily: 393, weekly: 818, monthly: 3500, freight: 200 },
  { description: "8T Carry Deck", daily: 802, weekly: 1824, monthly: 4553, freight: 250 },
  { description: "air band saws", daily: 45, weekly: 225, monthly: 675, freight: 100 },
  { description: "Air dryer", daily: 310, weekly: 742, monthly: 1500, freight: 200 },
  { description: "German saw clamps", daily: 0, weekly: 56, monthly: 112, freight: 25 },
  { description: "Air Horn", daily: 17.5, weekly: 50.1, monthly: 148.16, freight: 25 },
  { description: "German Saw", daily: 50, weekly: 250, monthly: 750, freight: 100 },
  { description: "Breathing Boxes, Hoses, Yokes and Masks", daily: 0, weekly: 0, monthly: 18350, freight: 1200 },
  { description: "UTV", daily: 212, weekly: 522, monthly: 926, freight: 50 },
  { description: "15 passanger van", daily: 256, weekly: 638, monthly: 2679, freight: 1500 },
  { description: "C-Cans", daily: 25, weekly: 200, monthly: 750, freight: 200 },
  { description: "1.5 ton air hoist  , 50ft load", daily: 65, weekly: 195, monthly: 780, freight: 250 },
  { description: "3 ton air hoist , 50ft load", daily: 90, weekly: 270, monthly: 1080, freight: 250 },
  { description: "6 ton air hoist , 50ft load", daily: 120, weekly: 360, monthly: 1440, freight: 250 },
  { description: "10 ton air hoist , 75 ft load", daily: 235, weekly: 705, monthly: 2820, freight: 250 },
  { description: "15 ton air hoist , 75 ft load", daily: 235, weekly: 705, monthly: 2820, freight: 250 },
  { description: "10K air tugger", daily: 85, weekly: 660, monthly: 1980, freight: 600 },
  { description: "30 ton manual hoist ,10 ft load", daily: 250, weekly: 750, monthly: 3000, freight: 250 },
  { description: "30 ton beam clamps", daily: 0, weekly: 225, monthly: 900, freight: 250 },
  { description: "chipping guns", daily: 66.5, weekly: 169.5, monthly: 514.5, freight: 0 },
  { description: "25 ton shackels", daily: 30, weekly: 90, monthly: 225, freight: 25 },
  { description: "35 ton shackels", daily: 30, weekly: 90, monthly: 270, freight: 25 },
  { description: "30 ton D rings", daily: 0, weekly: 90, monthly: 420, freight: 0 },
  { description: "milling motors", daily: 0, weekly: 0, monthly: 1600, freight: 0 },
  { description: "1/2 ton / 3/4 ton trucks", daily: 256, weekly: 638, monthly: 1750, freight: 1500 },
  { description: "5/8\" x12 9 part wire rope", daily: 0, weekly: 0, monthly: 700, freight: 100 },
  { description: "Hillman Rollers", daily: 0, weekly: 75, monthly: 225, freight: 100 },
  { description: "Hydro Pump 10,000 PSI", daily: 190, weekly: 310, monthly: 726, freight: 50 },
  { description: "Hydro Pump 3,600 PSI", daily: 107, weekly: 218, monthly: 584, freight: 50 },
  { description: "36\" clam shell", daily: 645, weekly: 2580, monthly: 7740, freight: 200 },
  { description: "20\" clam shell", daily: 345, weekly: 1380, monthly: 4140, freight: 200 },
  { description: "16\" clam shell", daily: 298, weekly: 1193, monthly: 3579, freight: 200 },
  { description: "10\" clam shell", daily: null, weekly: null, monthly: 2540, freight: 200 },
  { description: "30\" clam shell", daily: 604, weekly: 2417, monthly: 7251, freight: 200 },
  { description: "12\" clam shell", daily: 252, weekly: 1008, monthly: 3024, freight: 200 },
  { description: "clam shell blades", daily: 0, weekly: 0, monthly: 960, freight: 50 },
  { description: "30 ton Beam trolleys", daily: 0, weekly: 660, monthly: 1980, freight: 0 },
  { description: "ice machine", daily: 25, weekly: 100, monthly: 400, freight: 25 },
  { description: "rad gun", daily: 100, weekly: 500, monthly: 2000, freight: 0 },
];

export function thirdPartyRentalDescriptions(
  catalog: readonly ThirdPartyRentalRow[] = WOOD_RIVER_THIRD_PARTY_RENTAL,
): string[] {
  return catalog.map((row) => row.description);
}

export function lookupThirdPartyRental(
  description: string,
  catalog: readonly ThirdPartyRentalRow[] = WOOD_RIVER_THIRD_PARTY_RENTAL,
): ThirdPartyRentalRow | null {
  const trimmed = description.trim();
  if (!trimmed) return null;
  return catalog.find((row) => row.description === trimmed) ?? null;
}

function rawPeriodRate(row: ThirdPartyRentalRow, period: ThirdPartyRentalPeriod): number | null {
  if (period === "daily") return row.daily;
  if (period === "weekly") return row.weekly;
  return row.monthly;
}

/** 0 or null is no rate for that period — do not invent. */
export function thirdPartyRentalPeriodRate(row: ThirdPartyRentalRow, period: ThirdPartyRentalPeriod): number {
  const raw = rawPeriodRate(row, period);
  if (raw == null || !Number.isFinite(raw)) return 0;
  return raw;
}

export function hasThirdPartyPeriodRate(row: ThirdPartyRentalRow, period: ThirdPartyRentalPeriod): boolean {
  const raw = rawPeriodRate(row, period);
  return typeof raw === "number" && Number.isFinite(raw) && raw !== 0;
}

export function defaultThirdPartyPeriod(row: ThirdPartyRentalRow): ThirdPartyRentalPeriod {
  if (hasThirdPartyPeriodRate(row, "monthly")) return "monthly";
  if (hasThirdPartyPeriodRate(row, "weekly")) return "weekly";
  return "daily";
}

export function applyThirdPartyCatalogItem<
  T extends { item: string; period: ThirdPartyRentalPeriod; rate: number; freight: number },
>(line: T, item: string, catalog: readonly ThirdPartyRentalRow[] = WOOD_RIVER_THIRD_PARTY_RENTAL): T {
  const row = lookupThirdPartyRental(item, catalog);
  if (!row) return { ...line, item };
  const period = defaultThirdPartyPeriod(row);
  return {
    ...line,
    item,
    period,
    rate: thirdPartyRentalPeriodRate(row, period),
    freight: row.freight,
  };
}

export function applyThirdPartyCatalogPeriod<T extends { item: string; period: ThirdPartyRentalPeriod; rate: number }>(
  line: T,
  period: ThirdPartyRentalPeriod,
  catalog: readonly ThirdPartyRentalRow[] = WOOD_RIVER_THIRD_PARTY_RENTAL,
): T {
  const row = lookupThirdPartyRental(line.item, catalog);
  if (!row) return { ...line, period };
  return {
    ...line,
    period,
    rate: thirdPartyRentalPeriodRate(row, period),
  };
}
