"use client";

import { useState } from "react";
import { CATALOG_CUSTOM, catalogPickView } from "@/lib/catalog-pick";

export function CatalogPick({
  label,
  value,
  options,
  placeholder,
  onChange,
  allowCustom = false,
}: {
  label?: string;
  value: string;
  options: readonly string[];
  placeholder: string;
  onChange: (value: string) => void;
  allowCustom?: boolean;
}) {
  const [wantCustom, setWantCustom] = useState(false);
  const view = catalogPickView(value, options, allowCustom, wantCustom);
  return (
    <div className="min-w-[14rem] flex-1">
      {label ? <p className="text-xs">{label}</p> : null}
      <select
        value={view.selectValue}
        onChange={(event) => {
          if (allowCustom && event.target.value === CATALOG_CUSTOM) {
            setWantCustom(true);
            return;
          }
          setWantCustom(false);
          onChange(event.target.value);
        }}
        className={`paper-field w-full ${label ? "mt-1" : ""}`}
        aria-label={label || placeholder}
      >
        <option value="">{placeholder}</option>
        {options.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
        {allowCustom ? <option value={CATALOG_CUSTOM}>Type a title…</option> : null}
        {view.showValueOption ? <option value={value}>{value}</option> : null}
      </select>
      {view.showCustomInput ? (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="paper-field mt-1 w-full"
          aria-label={label ? `${label} title` : `${placeholder} title`}
        />
      ) : null}
    </div>
  );
}
