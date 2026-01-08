import { useCallback, useMemo, useState } from "react";

import {
  FamilyTreeWithWorker,
  type RawPerson,
  type Person as VizPerson,
} from "@funk-tree/tree-viz";

import type { Person } from "./person-card";
import { PersonCard } from "./person-card";

interface FamilyTreeProps {
  data: Person[];
  rootWikiId: string;
  onPersonClick?: (wikiId: string) => void;
}

export function FamilyTree({ data, rootWikiId, onPersonClick }: FamilyTreeProps) {
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);

  // Transform DB persons to tree-viz RawPerson format
  // tree-viz RawPerson uses snake_case matching DB schema
  const rawPersons = useMemo(() => data as unknown as RawPerson[], [data]);

  // Handle person selection from tree-viz
  const handlePersonSelect = useCallback(
    (vizPerson: VizPerson | null) => {
      if (!vizPerson) {
        setSelectedPerson(null);
        return;
      }

      // Find the original DB person to show full details in PersonCard
      const dbPerson = data.find((p) => p.wikiId === vizPerson.wikiId);
      if (dbPerson) {
        setSelectedPerson(dbPerson);
        onPersonClick?.(vizPerson.wikiId);
      }
    },
    [data, onPersonClick],
  );

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        No tree data available
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <FamilyTreeWithWorker
        persons={rawPersons}
        rootId={rootWikiId}
        className="h-full w-full"
        onPersonSelect={handlePersonSelect}
      />

      {selectedPerson && (
        <div className="absolute right-4 top-4 z-10">
          <PersonCard
            person={selectedPerson}
            onClose={() => setSelectedPerson(null)}
            onNavigate={onPersonClick}
          />
        </div>
      )}
    </div>
  );
}
