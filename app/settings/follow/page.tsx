"use client";

import { FollowDesk } from "@/components/FollowDesk";
import { SettingsGate } from "@/components/SettingsGate";

export default function SettingsFollowPage() {
  return (
    <SettingsGate ownerOnly>
      <FollowDesk />
    </SettingsGate>
  );
}
