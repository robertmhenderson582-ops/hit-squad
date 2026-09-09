"use client";

import { PositionsDesk } from "@/components/PositionsDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function SettingsPositionsPage() {
  return (
    <SettingsGate workingDesk addUsers>
      <PositionsDesk />
    </SettingsGate>
  );
}
