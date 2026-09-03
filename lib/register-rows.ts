export type ModuleRegisterRow = {
  id: string;
  cells: Record<string, string>;
};

export function emptyRegisterRow(id = `row-${Date.now()}`): ModuleRegisterRow {
  return { id, cells: {} };
}

export function hydrateRegisterRows(raw: unknown): ModuleRegisterRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row, index) => {
    const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const incoming = item.cells && typeof item.cells === "object" ? (item.cells as Record<string, unknown>) : {};
    const cells: Record<string, string> = {};
    for (const [key, value] of Object.entries(incoming)) {
      cells[key] = typeof value === "string" ? value : value != null ? String(value) : "";
    }
    return {
      id: typeof item.id === "string" && item.id ? item.id : `row-${index}`,
      cells,
    };
  });
}
