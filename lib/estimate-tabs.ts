import { changeOrderTabLabel } from "./change-order-packet.ts";
import { FERNDALE_TAB_ID, FERNDALE_TAB_LABEL, showsFerndaleTab } from "./ferndale-form.ts";
import { RODEO_TAB_ID, RODEO_TAB_LABEL, showsRodeoTab } from "./rodeo-form.ts";
import type { EstimateStatus } from "./estimate-status.ts";

export const BASE_ESTIMATE_TABS = [
  { id: "summary", label: "Job setup", icon: "📄" },
  { id: "activities", label: "Activities", icon: "∿" },
  { id: "crew", label: "Crew", icon: "⛑" },
  { id: "org-chart", label: "Org chart", icon: "⬡" },
  { id: "staffing", label: "Staffing", icon: "▦" },
  { id: "equipment", label: "Equipment", icon: "⛟" },
  { id: "subs", label: "Subcontractor", icon: "▣" },
  { id: "costs", label: "Other Cost", icon: "▤" },
  { id: "change-orders", label: "Change orders", icon: "⚖" },
  { id: "cost-report", label: "Cost report", icon: "📊" },
  { id: "purchasing", label: "Purchasing", icon: "🧾" },
  { id: "wage-lookup", label: "Wage lookup", icon: "＄" },
] as const;

export type EstimateTab = (typeof BASE_ESTIMATE_TABS)[number]["id"] | typeof RODEO_TAB_ID | typeof FERNDALE_TAB_ID;

export type EstimateTabRow = { id: EstimateTab; label: string; icon: string };

export function estimateTabsForSite(site = "", client = "", status?: EstimateStatus): EstimateTabRow[] {
  void status;
  const tabs: EstimateTabRow[] = BASE_ESTIMATE_TABS.map((tab) =>
    tab.id === "change-orders" ? { ...tab, label: changeOrderTabLabel(client, site) } : tab,
  );
  const idx = tabs.findIndex((item) => item.id === "wage-lookup");
  const at = idx < 0 ? tabs.length : idx;
  if (showsRodeoTab(site, client)) {
    tabs.splice(at, 0, { id: RODEO_TAB_ID, label: RODEO_TAB_LABEL, icon: "📋" });
  }
  if (showsFerndaleTab(site, client)) {
    tabs.splice(at, 0, { id: FERNDALE_TAB_ID, label: FERNDALE_TAB_LABEL, icon: "📋" });
  }
  return tabs;
}

export function estimateTabIdsForSite(site = "", client = "", status?: EstimateStatus) {
  return estimateTabsForSite(site, client, status).map((tab) => tab.id);
}
