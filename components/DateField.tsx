"use client";

import { useRef } from "react";

function openDatePicker(input: HTMLInputElement | null) {
  if (!input || input.disabled) return;
  try {
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
  } catch {
    /* picker already open, or the browser blocked it — fall through to focus */
  }
  input.focus();
}

export function DateField({
  value,
  onChange,
  disabled,
  className,
  min,
  max,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  min?: string;
  max?: string;
  "aria-label"?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`date-field ${disabled ? "is-disabled" : ""} ${className ?? ""}`}>
      <input
        ref={inputRef}
        type="date"
        value={value}
        min={min || undefined}
        max={max || undefined}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        onClick={() => openDatePicker(inputRef.current)}
        className="paper-field date-field-input"
      />
      {disabled ? null : (
      <button
        type="button"
        className="date-field-cal"
        tabIndex={-1}
        title="Open calendar"
        aria-label="Open calendar"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openDatePicker(inputRef.current);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect
            x="3.5"
            y="5"
            width="17"
            height="15.5"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          />
          <path d="M3.5 10h17" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <path
            d="M8 3.5v4M16 3.5v4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
      )}
    </div>
  );
}
