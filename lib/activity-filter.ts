/** Unique `who` values that actually appear on rows. Not the seeded tester roster. */
export function activityWhoNames(rows: { who: string }[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    const who = row.who.trim();
    if (who) names.add(who);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Empty / unset name keeps every row. Match is the person on the row (`who`). */
export function filterActivityByWho<T extends { who: string }>(
  rows: T[],
  who?: string | null,
): T[] {
  const wanted = (who ?? "").trim();
  if (!wanted) return [...rows];
  return rows.filter((row) => row.who.trim() === wanted);
}
