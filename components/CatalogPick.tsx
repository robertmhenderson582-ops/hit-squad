"use client";

import { useState } from "react";

const CUSTOM = "__custom__";

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
  const listed = (options as readonly string[]).includes(value);
  const [typing, setTyping] = useState(allowCustom && !listed && Boolean(value));
  const selectValue = listed ? value : typing ? CUSTOM : value;
  return (
    <div className="min-w-[14rem] flex-1">
      {label ? <p className="text-xs">{label}</p> : null}
      <select
        value={selectValue}
        onChange={(event) => {
          if (allowCustom && event.target.value === CUSTOM) {
            setTyping(true);
            onChange("");
            return;
          }
          setTyping(false);
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
        {allowCustom ? <option value={CUSTOM}>Type a title…</option> : null}
        {!allowCustom && !listed && value ? <option value={value}>{value}</option> : null}
      </select>
      {allowCustom && typing ? (
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
