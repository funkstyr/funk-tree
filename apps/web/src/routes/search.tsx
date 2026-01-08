import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import type { Person } from "@/components/person-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const searchSchema = z.object({
  q: z.string().optional(),
  location: z.string().optional(),
  page: z.number().optional().default(1),
});

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  component: SearchPage,
});

function SearchPage() {
  const { orpc } = Route.useRouteContext();
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();

  const [query, setQuery] = useState(searchParams.q || "");
  const [location, setLocation] = useState(searchParams.location || "");

  const limit = 20;
  const offset = ((searchParams.page || 1) - 1) * limit;

  const { data, isLoading, isFetching } = useQuery(
    orpc.genealogy.searchPersons.queryOptions({
      input: {
        query: searchParams.q || undefined,
        location: searchParams.location || undefined,
        limit,
        offset,
      },
    }),
  );

  const { data: stats } = useQuery(orpc.genealogy.getStats.queryOptions({}));

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({
      search: {
        q: query || undefined,
        location: location || undefined,
        page: 1,
      },
    });
  };

  const clearFilters = () => {
    setQuery("");
    setLocation("");
    navigate({ search: {} });
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;
  const currentPage = searchParams.page || 1;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-100">Search People</h1>
        {stats && (
          <p className="text-sm text-gray-400">
            {stats.totalPersons.toLocaleString()} people in database
          </p>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Filters sidebar */}
        <div className="w-72 border-r border-gray-800 p-4">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="query">Name</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <Input
                  id="query"
                  placeholder="Search by name..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="Birth or death location..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                Search
              </Button>
              {(searchParams.q || searchParams.location) && (
                <Button type="button" variant="outline" onClick={clearFilters}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : data?.results.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-gray-400">No results found</p>
                <p className="text-sm text-gray-500">Try adjusting your search filters</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-gray-400">
                <span>
                  Showing {offset + 1}-{Math.min(offset + limit, data?.total || 0)} of{" "}
                  {data?.total.toLocaleString()} results
                </span>
                {isFetching && <span className="text-blue-400">Loading...</span>}
              </div>

              {data?.results.map((person) => (
                <PersonResult key={person.id} person={person} />
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() =>
                      navigate({
                        search: { ...searchParams, page: currentPage - 1 },
                      })
                    }
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-gray-400">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() =>
                      navigate({
                        search: { ...searchParams, page: currentPage + 1 },
                      })
                    }
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PersonResult({ person }: { person: Person }) {
  const displayName =
    person.name ||
    [person.firstName, person.middleName, person.lastNameBirth].filter(Boolean).join(" ") ||
    person.wikiId;

  const lifespan = [person.birthDate, person.deathDate].filter(Boolean).join(" - ");

  return (
    <Link to="/tree/$wikiId" params={{ wikiId: person.wikiId }}>
      <Card className="transition-colors hover:bg-gray-800/50">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-medium text-gray-100">{displayName}</h3>
              {lifespan && <p className="text-sm text-gray-400">{lifespan}</p>}
              {person.birthLocation && (
                <p className="text-sm text-gray-500">Born: {person.birthLocation}</p>
              )}
              {person.deathLocation && (
                <p className="text-sm text-gray-500">Died: {person.deathLocation}</p>
              )}
            </div>
            <div className="text-right">
              {person.gender && (
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs ${
                    person.gender === "Male"
                      ? "bg-blue-900/50 text-blue-300"
                      : person.gender === "Female"
                        ? "bg-pink-900/50 text-pink-300"
                        : "bg-gray-700 text-gray-300"
                  }`}
                >
                  {person.gender}
                </span>
              )}
              {person.generation !== null && person.generation !== undefined && (
                <p className="mt-1 text-xs text-gray-500">Gen. {person.generation}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
