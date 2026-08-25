"use client";

import { GripToPan } from "@/components/GripToPan";

export function ModuleTable({
  headers,
  children,
  caption,
}: {
  headers: string[];
  children: React.ReactNode;
  caption?: string;
}) {
  return (
    <section className="steel-plate paper-grain overflow-hidden">
      {caption ? (
        <div className="border-b border-steel-rim/30 px-4 py-3 font-mono text-[11px] tracking-[0.2em] text-steel-glow">
          {caption}
        </div>
      ) : null}
      <GripToPan>
        <table className="min-w-full text-left text-sm">
          <thead className="font-mono text-[10px] tracking-[0.16em] text-paper-cream/55">
            <tr>
              {headers.map((header) => (
                <th key={header} className="whitespace-nowrap px-4 py-3">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </GripToPan>
    </section>
  );
}
