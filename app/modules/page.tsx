"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { FutureModulesDesk } from "@/components/FutureModulesDesk";

export default function ModulesPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="FUTURE MODULES">
        <FutureModulesDesk />
      </DeskChrome>
    </AuthGate>
  );
}
