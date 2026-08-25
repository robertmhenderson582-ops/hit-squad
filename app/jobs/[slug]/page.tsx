"use client";

import { useParams } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { DeskChrome } from "@/components/DeskChrome";
import { JobPlantPage } from "@/components/JobPlantPage";

export default function JobSlugPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "wood-river";

  return (
    <AuthGate require="authenticated">
      <DeskChrome title="JOB" hideTitle>
        <JobPlantPage slug={slug} />
      </DeskChrome>
    </AuthGate>
  );
}
