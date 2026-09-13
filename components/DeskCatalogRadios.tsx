"use client";

import type { KeyboardEvent } from "react";

export type DeskCatalogRadio = {
  id: string;
  label: string;
};

type DeskCatalogRadiosProps = {
  name: string;
  groupLabel: string;
  items: readonly DeskCatalogRadio[];
  value: string;
  idPrefix: string;
  openLabel?: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
};

export function DeskCatalogRadios({
  name,
  groupLabel,
  items,
  value,
  idPrefix,
  openLabel = "Open form",
  onSelect,
  onOpen,
}: DeskCatalogRadiosProps) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End", "Enter"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Enter") {
      onOpen(value);
      return;
    }
    const index = items.findIndex((item) => item.id === value);
    if (event.key === "Home") return onSelect(items[0].id);
    if (event.key === "End") return onSelect(items[items.length - 1].id);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + step + items.length) % items.length;
    onSelect(items[next].id);
  }

  return (
    <div role="radiogroup" aria-label={groupLabel} className="flex flex-wrap gap-2" onKeyDown={onKeyDown}>
      {items.map((item) => {
        const selected = value === item.id;
        return (
          <label
            key={item.id}
            title={selected ? openLabel : undefined}
            className={`inline-flex cursor-pointer items-center rounded-sm border px-3 py-1.5 text-sm ${
              selected ? "border-steel bg-steel text-white" : "border-steel text-steel"
            }`}
          >
            <input
              id={`${idPrefix}-${item.id}`}
              type="radio"
              name={name}
              className="sr-only"
              checked={selected}
              aria-label={selected ? `${item.label}. ${openLabel}` : item.label}
              onChange={() => onSelect(item.id)}
              onClick={() => {
                if (selected) onOpen(item.id);
              }}
            />
            {item.label}
          </label>
        );
      })}
    </div>
  );
}
