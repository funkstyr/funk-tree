import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface Person {
  id: number;
  wikiId: string;
  wikiNumericId?: number | null;
  name?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastNameBirth?: string | null;
  lastNameCurrent?: string | null;
  suffix?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  birthLocation?: string | null;
  deathLocation?: string | null;
  isLiving?: boolean | null;
  generation?: number | null;
  fatherWikiId?: string | null;
  motherWikiId?: string | null;
}

interface PersonCardProps {
  person: Person;
  onClose?: () => void;
  onNavigate?: (wikiId: string) => void;
}

export function PersonCard({ person, onClose, onNavigate }: PersonCardProps) {
  const displayName =
    person.name ||
    [person.firstName, person.middleName, person.lastNameBirth].filter(Boolean).join(" ") ||
    person.wikiId;

  const lifespan = [person.birthDate, person.deathDate].filter(Boolean).join(" - ");

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

        {person.birthLocation && (
          <div className="flex justify-between">
            <span className="text-gray-500">Birth</span>
            <span className="text-gray-300 text-right max-w-48 truncate">
              {person.birthLocation}
            </span>
          </div>
        )}

        {person.deathLocation && (
          <div className="flex justify-between">
            <span className="text-gray-500">Death</span>
            <span className="text-gray-300 text-right max-w-48 truncate">
              {person.deathLocation}
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
          {person.fatherWikiId && onNavigate && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => onNavigate(person.fatherWikiId!)}
            >
              View Father
            </Button>
          )}
          {person.motherWikiId && onNavigate && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => onNavigate(person.motherWikiId!)}
            >
              View Mother
            </Button>
          )}
        </div>

        <a
          href={`https://www.wikitree.com/wiki/${person.wikiId}`}
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
