"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { ModuleGate } from "@/components/ModuleGate";
import { ModuleTable } from "@/components/ModuleTable";

const TICKETS = [
  { id: "TK-104", title: "Isolation list rev D — extras", owner: "Night captain", status: "OPEN" },
  { id: "TK-109", title: "Bundle pull hold — E-310", owner: "Foreman BM", status: "HOLD" },
  { id: "TK-112", title: "Rate question — IL burden", owner: "Estimator", status: "OPEN" },
];

export default function TicketsPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="TICKETS">
        <ModuleGate need="tickets">
          <p className="mt-3 max-w-3xl text-sm leading-6 text-paper-cream/80">
            Field-trial tickets stay on this desk. Testers do not see other testers.
          </p>
          <ModuleTable caption="TICKETS" headers={["NO.", "TITLE", "OWNER", "STATUS"]}>
            {TICKETS.map((row) => (
              <tr key={row.id} className="border-t border-steel-rim/20">
                <td className="px-4 py-3 font-mono text-amber-label">{row.id}</td>
                <td className="px-4 py-3">{row.title}</td>
                <td className="px-4 py-3">{row.owner}</td>
                <td className="px-4 py-3">{row.status}</td>
              </tr>
            ))}
          </ModuleTable>
        </ModuleGate>
      </DeskChrome>
    </AuthGate>
  );
}
