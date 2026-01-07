import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { FamilyTree } from "@/components/family-tree";
import type { Person } from "@/components/person-card";
import { Skeleton } from "@/components/ui/skeleton";

// Heinrich Funck - the patriarch
const ROOT_WIKI_ID = "Funck-6";

export const Route = createFileRoute("/tree/")({
  component: TreePage,
});

function TreePage() {
  const { orpc } = Route.useRouteContext();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery(
    orpc.genealogy.getDescendants.queryOptions({
      input: { wikiId: ROOT_WIKI_ID, depth: 4 },
    })
  );

  const handlePersonClick = (wikiId: string) => {
    navigate({ to: "/tree/$wikiId", params: { wikiId } });
  };

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-400">Error loading tree</h2>
          <p className="text-gray-400">{error.message}</p>
        </div>
      </div>
    );
  }

  const persons = (data || []) as Person[];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-100">Funk Family Tree</h1>
        <p className="text-sm text-gray-400">
          Starting from Heinrich Funck (c. 1690-1760)
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <FamilyTree
          data={persons}
          rootWikiId={ROOT_WIKI_ID}
          onPersonClick={handlePersonClick}
        />
      </div>
    </div>
  );
}
