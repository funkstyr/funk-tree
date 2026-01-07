import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowUp, ArrowDown } from "lucide-react";
import { useState } from "react";

import { FamilyTree } from "@/components/family-tree";
import type { Person } from "@/components/person-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/tree/$wikiId")({
  component: PersonTreePage,
});

function PersonTreePage() {
  const { wikiId } = Route.useParams();
  const { orpc } = Route.useRouteContext();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"descendants" | "ancestors">("descendants");

  const { data: person, isLoading: personLoading } = useQuery(
    orpc.genealogy.getPerson.queryOptions({
      input: { wikiId },
    })
  );

  const { data: treeData, isLoading: treeLoading } = useQuery(
    viewMode === "descendants"
      ? orpc.genealogy.getDescendants.queryOptions({
          input: { wikiId, depth: 4 },
        })
      : orpc.genealogy.getAncestors.queryOptions({
          input: { wikiId, depth: 4 },
        })
  );

  const handlePersonClick = (newWikiId: string) => {
    navigate({ to: "/tree/$wikiId", params: { wikiId: newWikiId } });
  };

  const isLoading = personLoading || treeLoading;

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-300">Person not found</h2>
          <p className="text-gray-400 mb-4">WikiTree ID: {wikiId}</p>
          <Link to="/tree">
            <Button variant="outline">Back to main tree</Button>
          </Link>
        </div>
      </div>
    );
  }

  const displayName =
    person.name ||
    [person.firstName, person.middleName, person.lastNameBirth]
      .filter(Boolean)
      .join(" ") ||
    wikiId;

  const persons = (treeData || []) as Person[];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link to="/tree">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-100">{displayName}</h1>
            <p className="text-sm text-gray-400">
              {[person.birthDate, person.deathDate].filter(Boolean).join(" - ")}
              {person.birthLocation && ` | ${person.birthLocation}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === "ancestors" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("ancestors")}
            >
              <ArrowUp className="mr-1 h-4 w-4" />
              Ancestors
            </Button>
            <Button
              variant={viewMode === "descendants" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("descendants")}
            >
              <ArrowDown className="mr-1 h-4 w-4" />
              Descendants
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <FamilyTree
          data={persons}
          rootWikiId={wikiId}
          onPersonClick={handlePersonClick}
        />
      </div>
    </div>
  );
}
