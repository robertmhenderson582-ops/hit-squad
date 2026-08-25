"use client";

import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { QualityDesk } from "@/components/QualityDesk";

export default function QualityPage() {
  return (
    <AuthGate require="authenticated">
      <DeskChrome title="QUALITY / ITP">
        <QualityDesk />
      </DeskChrome>
    </AuthGate>
  );
}
