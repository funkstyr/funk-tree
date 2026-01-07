import type { Person, TreeNode, TreeState } from "./types";

export interface RawPerson {
  id?: number;
  wiki_id: string;
  name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name_birth?: string | null;
  last_name_current?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  birth_location?: string | null;
  death_location?: string | null;
  gender?: string | null;
  generation?: number | null;
  father_wiki_id?: string | null;
  mother_wiki_id?: string | null;
}

export function transformPerson(raw: RawPerson): Person {
  const name =
    raw.name ||
    [raw.first_name, raw.middle_name, raw.last_name_birth].filter(Boolean).join(" ") ||
    raw.wiki_id;

  return {
    id: raw.wiki_id,
    wikiId: raw.wiki_id,
    name,
    firstName: raw.first_name || undefined,
    lastName: raw.last_name_birth || undefined,
    birthDate: raw.birth_date || undefined,
    deathDate: raw.death_date || undefined,
    birthLocation: raw.birth_location || undefined,
    deathLocation: raw.death_location || undefined,
    gender: raw.gender === "Male" ? "M" : raw.gender === "Female" ? "F" : "U",
    generation: raw.generation ?? undefined,
  };
}

export function buildTreeState(rawPersons: RawPerson[], rootId: string): TreeState {
  const nodes = new Map<string, TreeNode>();
  const personMap = new Map<string, RawPerson>();

  // First pass: create all nodes
  for (const raw of rawPersons) {
    personMap.set(raw.wiki_id, raw);

    const person = transformPerson(raw);
    const node: TreeNode = {
      id: person.id,
      person,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      parentIds: [],
      childIds: [],
      spouseIds: [],
      collapsed: false,
      selected: false,
      highlighted: false,
    };
    nodes.set(person.id, node);
  }

  // Second pass: build relationships
  for (const raw of rawPersons) {
    const node = nodes.get(raw.wiki_id);
    if (!node) continue;

    // Add parent relationships
    if (raw.father_wiki_id && nodes.has(raw.father_wiki_id)) {
      node.parentIds.push(raw.father_wiki_id);
      const father = nodes.get(raw.father_wiki_id)!;
      if (!father.childIds.includes(raw.wiki_id)) {
        father.childIds.push(raw.wiki_id);
      }
    }

    if (raw.mother_wiki_id && nodes.has(raw.mother_wiki_id)) {
      node.parentIds.push(raw.mother_wiki_id);
      const mother = nodes.get(raw.mother_wiki_id)!;
      if (!mother.childIds.includes(raw.wiki_id)) {
        mother.childIds.push(raw.wiki_id);
      }
    }

    // Detect spouse relationships (parents who share children)
    if (raw.father_wiki_id && raw.mother_wiki_id) {
      const father = nodes.get(raw.father_wiki_id);
      const mother = nodes.get(raw.mother_wiki_id);
      if (father && mother) {
        if (!father.spouseIds.includes(raw.mother_wiki_id)) {
          father.spouseIds.push(raw.mother_wiki_id);
        }
        if (!mother.spouseIds.includes(raw.father_wiki_id)) {
          mother.spouseIds.push(raw.father_wiki_id);
        }
      }
    }
  }

  return {
    nodes,
    edges: new Map(),
    rootId,
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    generations: new Map(),
  };
}
