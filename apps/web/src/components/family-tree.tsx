import { useCallback, useMemo, useState } from "react";
import Tree, { type RawNodeDatum, type TreeNodeDatum } from "react-d3-tree";

import type { Person } from "./person-card";

import { PersonCard } from "./person-card";

interface FamilyTreeProps {
  data: Person[];
  rootWikiId: string;
  onPersonClick?: (wikiId: string) => void;
}

interface TreeNode extends RawNodeDatum {
  attributes?: {
    wikiId: string;
    birthDate?: string;
    deathDate?: string;
    birthLocation?: string;
    gender?: string;
  };
  children?: TreeNode[];
}

// Transform flat person list into hierarchical tree structure
function buildTreeData(persons: Person[], rootWikiId: string): TreeNode | null {
  const personMap = new Map<string, Person>();
  for (const person of persons) {
    personMap.set(person.wiki_id, person);
  }

  const rootPerson = personMap.get(rootWikiId);
  if (!rootPerson) return null;

  // Build children map
  const childrenMap = new Map<string, Person[]>();
  for (const person of persons) {
    if (person.father_wiki_id) {
      const siblings = childrenMap.get(person.father_wiki_id) || [];
      siblings.push(person);
      childrenMap.set(person.father_wiki_id, siblings);
    }
    if (person.mother_wiki_id && person.mother_wiki_id !== person.father_wiki_id) {
      const siblings = childrenMap.get(person.mother_wiki_id) || [];
      if (!siblings.find((s) => s.wiki_id === person.wiki_id)) {
        siblings.push(person);
        childrenMap.set(person.mother_wiki_id, siblings);
      }
    }
  }

  function buildNode(person: Person, depth: number = 0): TreeNode {
    const children = childrenMap.get(person.wiki_id) || [];
    const displayName =
      person.name ||
      [person.first_name, person.middle_name, person.last_name_birth]
        .filter(Boolean)
        .join(" ") ||
      person.wiki_id;

    return {
      name: displayName,
      attributes: {
        wikiId: person.wiki_id,
        birthDate: person.birth_date || undefined,
        deathDate: person.death_date || undefined,
        birthLocation: person.birth_location || undefined,
        gender: person.gender || undefined,
      },
      children:
        depth < 5 ? children.map((child) => buildNode(child, depth + 1)) : [],
    };
  }

  return buildNode(rootPerson);
}

// Custom node component
function renderCustomNode({
  nodeDatum,
  onNodeClick,
}: {
  nodeDatum: TreeNodeDatum;
  onNodeClick: (wikiId: string) => void;
}) {
  const attrs = nodeDatum.attributes as TreeNode["attributes"];
  const dates = [attrs?.birthDate, attrs?.deathDate].filter(Boolean).join(" - ");

  return (
    <g>
      <circle
        r={20}
        fill={attrs?.gender === "Male" ? "#3b82f6" : attrs?.gender === "Female" ? "#ec4899" : "#6b7280"}
        stroke="#1f2937"
        strokeWidth={2}
        onClick={() => attrs?.wikiId && onNodeClick(attrs.wikiId)}
        style={{ cursor: "pointer" }}
      />
      <text
        fill="#e5e7eb"
        x={28}
        y={-5}
        style={{ fontSize: "14px", fontWeight: 500 }}
      >
        {nodeDatum.name}
      </text>
      {dates && (
        <text fill="#9ca3af" x={28} y={12} style={{ fontSize: "11px" }}>
          {dates}
        </text>
      )}
    </g>
  );
}

export function FamilyTree({ data, rootWikiId, onPersonClick }: FamilyTreeProps) {
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const treeData = useMemo(() => buildTreeData(data, rootWikiId), [data, rootWikiId]);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const { width, height } = node.getBoundingClientRect();
      setDimensions({ width, height });
    }
  }, []);

  const handleNodeClick = useCallback(
    (wikiId: string) => {
      const person = data.find((p) => p.wiki_id === wikiId);
      if (person) {
        setSelectedPerson(person);
      }
      onPersonClick?.(wikiId);
    },
    [data, onPersonClick]
  );

  if (!treeData) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        No tree data available
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" ref={containerRef}>
      <Tree
        data={treeData}
        orientation="vertical"
        pathFunc="step"
        translate={{ x: dimensions.width / 2, y: 50 }}
        nodeSize={{ x: 200, y: 100 }}
        separation={{ siblings: 1.5, nonSiblings: 2 }}
        renderCustomNodeElement={(props) =>
          renderCustomNode({ ...props, onNodeClick: handleNodeClick })
        }
        pathClassFunc={() => "stroke-gray-600"}
        zoomable
        draggable
        collapsible
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
