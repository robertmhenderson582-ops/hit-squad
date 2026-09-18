import type { ReactNode } from "react";
import type { Metadata } from "next";
import { CONTROL_CENTER_TITLE } from "@/lib/onboard-pipeline";

export const metadata: Metadata = {
  title: CONTROL_CENTER_TITLE,
};

export default function OnboardLayout({ children }: { children: ReactNode }) {
  return children;
}
