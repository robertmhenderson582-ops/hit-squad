"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { lensPeopleFromSeats, peopleVisibleTo, seededDeskPeople, type DeskPerson } from "@/lib/desk-people";
import type { HandoffSeat } from "@/lib/handoff";
import { DESK_SEATS_CHANGED_EVENT } from "@/lib/manage-users-add";

export function useDeskPeople() {
  const { user } = useSession();
  const seeded = useMemo(() => peopleVisibleTo(user, seededDeskPeople()), [user]);
  const [fetched, setFetched] = useState<DeskPerson[] | null>(null);

  useEffect(() => {
    function load() {
      fetch("/api/desk/seats", { credentials: "include", cache: "no-store" })
        .then((response) => response.json())
        .then((data) => {
          if (!Array.isArray(data.seats)) return;
          setFetched(peopleVisibleTo(user, lensPeopleFromSeats(data.seats)));
        })
        .catch(() => undefined);
    }
    load();
    window.addEventListener("focus", load);
    window.addEventListener(DESK_SEATS_CHANGED_EVENT, load);
    return () => {
      window.removeEventListener("focus", load);
      window.removeEventListener(DESK_SEATS_CHANGED_EVENT, load);
    };
  }, [user]);

  return fetched ?? seeded;
}

/** Share / Turn over list. Testers can load this; they cannot load Users seats. */
export function useHandoffPeople() {
  const [people, setPeople] = useState<HandoffSeat[]>([]);

  useEffect(() => {
    fetch("/api/desk/handoff", { credentials: "include", cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setPeople(Array.isArray(data.people) ? data.people : []))
      .catch(() => undefined);
  }, []);

  return people;
}
