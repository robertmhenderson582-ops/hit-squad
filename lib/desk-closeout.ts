export type ClosedItem = { id: string; title: string; kind: "estimate" | "job" };

const KEY = "hs_closed_packages";

export function readClosed(): ClosedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ClosedItem[];
  } catch {
    return [];
  }
}

export function writeClosed(items: ClosedItem[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items));
}

export function isClosed(id: string) {
  return readClosed().some((item) => item.id === id);
}

export function closePackage(item: ClosedItem) {
  const next = readClosed().filter((row) => row.id !== item.id);
  next.push(item);
  writeClosed(next);
}

export function reopenPackage(id: string) {
  writeClosed(readClosed().filter((item) => item.id !== id));
}

export function jobLooksClosed(job: { id: string; title: string }, closed: ClosedItem[] = readClosed()) {
  return closed.some(
    (item) =>
      item.id === job.id ||
      (item.title && job.title.toLowerCase().includes(item.title.toLowerCase().slice(0, 16))),
  );
}
