"use client";

import { useState } from "react";

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  variant = "paper",
  required,
  minLength,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  variant?: "paper" | "night";
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  const night = variant === "night";

  return (
    <label className="block">
      <span className={night ? "font-mono text-[10px] tracking-[0.24em] text-steel-glow" : "text-xs tracking-[0.16em] text-[#5b6f73]"}>
        {label}
      </span>
      <span className="relative mt-1 block">
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          minLength={minLength}
          disabled={disabled}
          className={
            night
              ? "w-full border border-steel-rim/40 bg-ink/70 px-3 py-2 pr-12 font-mono text-sm text-paper-cream"
              : "paper-field pr-12"
          }
        />
        <button
          type="button"
          className={`password-eye ${night ? "password-eye-night" : ""}`}
          onClick={() => setShow((on) => !on)}
          disabled={disabled}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? "hide" : "eye"}
        </button>
      </span>
    </label>
  );
}
