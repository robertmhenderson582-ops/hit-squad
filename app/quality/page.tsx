"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { ModuleGate } from "@/components/ModuleGate";
import { QualityDesk } from "@/components/QualityDesk";

export default function QualityPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="QUALITY / ITP">
        <ModuleGate need="quality">
          <QualityDesk />
        </ModuleGate>
      </DeskChrome>
    </AuthGate>
  );
}
