"use client";

import { useSession } from "@/components/SessionProvider";

export function CreatedBy({ author }: { author: string }) {
  const { user } = useSession();
  const yours = Boolean(user && author === user.name);

  if (yours) {
    return <span className="yours-pill">Yours</span>;
  }
  return <span className="prepared-by">Prepared by {author}</span>;
}
