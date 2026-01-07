import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface Person {
  id: number;
  wiki_id: string;
  wiki_numeric_id?: number | null;
  name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name_birth?: string | null;
  last_name_current?: string | null;
  suffix?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  birth_location?: string | null;
  death_location?: string | null;
  is_living?: boolean | null;
  generation?: number | null;
  father_wiki_id?: string | null;
  mother_wiki_id?: string | null;
}

interface PersonCardProps {
  person: Person;
  onClose?: () => void;
  onNavigate?: (wikiId: string) => void;
}

export function PersonCard({ person, onClose, onNavigate }: PersonCardProps) {
  const displayName =
    person.name ||
    [person.first_name, person.middle_name, person.last_name_birth].filter(Boolean).join(" ") ||
    person.wiki_id;

  const lifespan = [person.birth_date, person.death_date].filter(Boolean).join(" - ");

  return (
    <Card className="w-80 bg-gray-900 border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg text-gray-100">{displayName}</CardTitle>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-gray-400 hover:text-gray-100"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {lifespan && <p className="text-sm text-gray-400">{lifespan}</p>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {person.gender && (
          <div className="flex justify-between">
            <span className="text-gray-500">Gender</span>
            <span className="text-gray-300">{person.gender}</span>
          </div>
        )}

        {person.birth_location && (
          <div className="flex justify-between">
            <span className="text-gray-500">Birth</span>
            <span className="text-gray-300 text-right max-w-48 truncate">
              {person.birth_location}
            </span>
          </div>
        )}

        {person.death_location && (
          <div className="flex justify-between">
            <span className="text-gray-500">Death</span>
            <span className="text-gray-300 text-right max-w-48 truncate">
              {person.death_location}
            </span>
          </div>
        )}

        {person.generation !== null && person.generation !== undefined && (
          <div className="flex justify-between">
            <span className="text-gray-500">Generation</span>
            <span className="text-gray-300">{person.generation}</span>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {person.father_wiki_id && onNavigate && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => onNavigate(person.father_wiki_id!)}
            >
              View Father
            </Button>
          )}
          {person.mother_wiki_id && onNavigate && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => onNavigate(person.mother_wiki_id!)}
            >
              View Mother
            </Button>
          )}
        </div>

        <a
          href={`https://www.wikitree.com/wiki/${person.wiki_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-blue-400 hover:text-blue-300"
        >
          View on WikiTree
        </a>
      </CardContent>
    </Card>
  );
}
