"use client";

import { useSession } from "@/components/SessionProvider";
import { isTester } from "@/lib/desk-role";

export function CreatedBy({ author }: { author: string }) {
  const { user } = useSession();
  const yours = Boolean(user && author === user.name);

  if (yours) {
    return <span className="yours-pill">Yours</span>;
  }
  if (isTester(user)) return null;
  return <span className="prepared-by">Prepared by {author}</span>;
}
