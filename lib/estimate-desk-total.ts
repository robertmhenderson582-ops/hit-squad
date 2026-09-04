/**
 * One Estimate Total for the desk HUD and the Excel Summary.
 * Same estimateTotalBreakdown path EstimateTotalRail uses — do not
 * independently invent a second grand total.
 */
import { emptyFcrPacket, fcrSummary, normalizePeople, type FcrPacket } from "./change-order-packet.ts";
import { equipmentTotals, thirdPartyCost, type EquipmentSheet } from "./equipment-sheet.ts";
import {
  CBA_INCREASE_LABEL,
  EQUIPMENT_CONTINGENCY_LABEL,
  LABOR_CONTINGENCY_LABEL,
  MORE_FUND_LABEL,
  SUBS_CONTINGENCY_LABEL,
  cbaIncreaseDollars,
  moneyAdderLines,
  moreFundDollars,
  type JobMoney,
} from "./estimate-money.ts";
import { estimateMarkupDollars, estimateTotalBreakdown, signedMoneyLines, type EstimateTotalBreakdown } from "./estimate-total.ts";
import { otherCostTotals, type OtherCostSheet } from "./other-cost.ts";
import { laborDollarsFromCrew, perDiemDollarsFromCrew, type JobRates } from "./shahan-wood-river.ts";
import { subcontractorMarkupBase, subcontractorTotal, type SubSheet } from "./subcontractor.ts";
import { wageLookupOpts } from "./wage-lookup.ts";

export type DeskPackageCrew = {
  staff?: Parameters<typeof laborDollarsFromCrew>[0]["staff"];
  generalForeman?: Parameters<typeof laborDollarsFromCrew>[0]["generalForeman"];
  foreman?: Parameters<typeof laborDollarsFromCrew>[0]["foreman"];
  direct?: Parameters<typeof laborDollarsFromCrew>[0]["direct"];
  support?: Parameters<typeof laborDollarsFromCrew>[0]["support"];
  otAfter8?: boolean;
};

export type DeskPackageInput = {
  crew?: DeskPackageCrew;
  site?: string;
  client?: string;
  equipment?: EquipmentSheet;
  otherCost?: OtherCostSheet;
  subcontractor?: SubSheet | null;
  jobMeta?: Partial<JobRates & JobMoney>;
  changeOrders?: number;
  hours?: number;
};

export function deskPackageBreakdown(input: DeskPackageInput): EstimateTotalBreakdown {
  const site = input.site ?? "";
  const client = input.client ?? "";
  const equipment = input.equipment ?? { largeTools: [], thirdParty: [] };
  const other = input.otherCost ?? { perDiemRate: 0, travel: [], misc: [] };
  const thirdCost = (equipment.thirdParty ?? []).reduce((sum, line) => sum + thirdPartyCost(line), 0);
  const tools = equipmentTotals(equipment).largeTools;
  const rest = otherCostTotals({ ...other, perDiemRate: 0 }, 0);
  const rates = {
    staffPerDiemRate: Number(input.jobMeta?.staffPerDiemRate) || 0,
    craftPerDiemRate: Number(input.jobMeta?.craftPerDiemRate) || 0,
  };
  const perDiem = perDiemDollarsFromCrew(input.crew ?? {}, rates, site, client);
  const subCtx = { site, client, otAfter8: Boolean(input.crew?.otAfter8) };
  const sheet = input.subcontractor;
  const subcontractor = subcontractorTotal(sheet, subCtx);
  const labor = laborDollarsFromCrew(input.crew ?? {}, site, client, wageLookupOpts(site));
  const cba = cbaIncreaseDollars(input.crew ?? {}, input.jobMeta ?? {}, site, client, wageLookupOpts(site));
  const more = moreFundDollars(input.crew ?? {}, input.jobMeta?.moreFundPerHour ?? null, site, client);
  const adders = moneyAdderLines({
    labor,
    equipment: tools + thirdCost,
    subcontractor,
    money: input.jobMeta ?? {},
    cbaIncrease: cba,
    moreFund: more,
  });
  return estimateTotalBreakdown({
    labor,
    equipment: tools + thirdCost,
    subcontractor,
    markup: estimateMarkupDollars({
      subcontractor: subcontractorMarkupBase(sheet, subCtx),
      thirdParty: thirdCost,
      misc: rest.misc,
      client,
      site,
    }),
    otherCost: rest.total + perDiem,
    changeOrders: input.changeOrders ?? 0,
    hours: input.hours ?? 0,
    client,
    site,
    extras: signedMoneyLines([
      { id: "labor-contingency", label: LABOR_CONTINGENCY_LABEL, amount: adders.laborContingency },
      { id: "equipment-contingency", label: EQUIPMENT_CONTINGENCY_LABEL, amount: adders.equipmentContingency },
      { id: "subs-contingency", label: SUBS_CONTINGENCY_LABEL, amount: adders.subsContingency },
      { id: "cba-increase", label: CBA_INCREASE_LABEL, amount: adders.cbaIncrease },
      { id: "more-fund", label: MORE_FUND_LABEL, amount: adders.moreFund },
    ]),
  });
}

export function deskPackageTotal(input: DeskPackageInput): number {
  return Math.round(deskPackageBreakdown(input).total * 100) / 100;
}

/** FCR dollars the live rail already includes. Empty / missing packet is $0. */
export function fcrChangeOrderTotal(packet: FcrPacket | null | undefined): number {
  if (!packet) return 0;
  return fcrSummary(packet, 0, 0).total;
}

export function fcrFromUnknown(raw: unknown): FcrPacket {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyFcrPacket();
  const parsed = raw as Partial<FcrPacket>;
  return {
    ...emptyFcrPacket(),
    ...parsed,
    header: { ...emptyFcrPacket().header, ...parsed.header },
    people: Array.isArray(parsed.people) ? normalizePeople(parsed.people) : [],
    log: Array.isArray(parsed.log) ? parsed.log : [],
    sub: Number(parsed.sub) || 0,
    equipment: Number(parsed.equipment) || 0,
    misc: Number(parsed.misc) || 0,
  };
}
