import { describe, it, expect } from "vitest";
import { transformPerson, buildTreeState, type RawPerson } from "./transform";

describe("transformPerson", () => {
  it("transforms a complete person record", () => {
    const raw: RawPerson = {
      wiki_id: "Funck-6",
      name: "Heinrich Funck",
      first_name: "Heinrich",
      last_name_birth: "Funck",
      birth_date: "1697",
      death_date: "1760",
      birth_location: "Palatinate, Germany",
      gender: "Male",
      generation: 1,
    };

    const result = transformPerson(raw);

    expect(result.id).toBe("Funck-6");
    expect(result.wikiId).toBe("Funck-6");
    expect(result.name).toBe("Heinrich Funck");
    expect(result.firstName).toBe("Heinrich");
    expect(result.lastName).toBe("Funck");
    expect(result.birthDate).toBe("1697");
    expect(result.deathDate).toBe("1760");
    expect(result.birthLocation).toBe("Palatinate, Germany");
    expect(result.gender).toBe("M");
    expect(result.generation).toBe(1);
  });

  it("builds name from parts when name field is empty", () => {
    const raw: RawPerson = {
      wiki_id: "Test-1",
      first_name: "John",
      middle_name: "William",
      last_name_birth: "Doe",
      gender: "Male",
    };

    const result = transformPerson(raw);

    expect(result.name).toBe("John William Doe");
  });

  it("falls back to wiki_id when no name parts available", () => {
    const raw: RawPerson = {
      wiki_id: "Unknown-123",
      gender: null,
    };

    const result = transformPerson(raw);

    expect(result.name).toBe("Unknown-123");
  });

  it("maps gender correctly", () => {
    expect(transformPerson({ wiki_id: "A", gender: "Male" }).gender).toBe("M");
    expect(transformPerson({ wiki_id: "B", gender: "Female" }).gender).toBe("F");
    expect(transformPerson({ wiki_id: "C", gender: null }).gender).toBe("U");
    expect(transformPerson({ wiki_id: "D", gender: "Unknown" }).gender).toBe("U");
  });

  it("handles null/undefined fields gracefully", () => {
    const raw: RawPerson = {
      wiki_id: "Null-1",
      name: null,
      first_name: null,
      birth_date: null,
      death_date: null,
      birth_location: null,
      gender: null,
      generation: null,
    };

    const result = transformPerson(raw);

    expect(result.id).toBe("Null-1");
    expect(result.firstName).toBeUndefined();
    expect(result.birthDate).toBeUndefined();
    expect(result.deathDate).toBeUndefined();
    expect(result.birthLocation).toBeUndefined();
    expect(result.generation).toBeUndefined();
  });
});

describe("buildTreeState", () => {
  it("creates nodes for all persons", () => {
    const persons: RawPerson[] = [
      { wiki_id: "A", name: "Person A", gender: "Male" },
      { wiki_id: "B", name: "Person B", gender: "Female" },
      { wiki_id: "C", name: "Person C", gender: "Male" },
    ];

    const result = buildTreeState(persons, "A");

    expect(result.nodes.size).toBe(3);
    expect(result.nodes.has("A")).toBe(true);
    expect(result.nodes.has("B")).toBe(true);
    expect(result.nodes.has("C")).toBe(true);
  });

  it("builds parent-child relationships correctly", () => {
    const persons: RawPerson[] = [
      { wiki_id: "Father", name: "Father", gender: "Male" },
      { wiki_id: "Mother", name: "Mother", gender: "Female" },
      {
        wiki_id: "Child",
        name: "Child",
        gender: "Male",
        father_wiki_id: "Father",
        mother_wiki_id: "Mother",
      },
    ];

    const result = buildTreeState(persons, "Father");

    const father = result.nodes.get("Father")!;
    const mother = result.nodes.get("Mother")!;
    const child = result.nodes.get("Child")!;

    // Child should have both parents
    expect(child.parentIds).toContain("Father");
    expect(child.parentIds).toContain("Mother");

    // Parents should have child
    expect(father.childIds).toContain("Child");
    expect(mother.childIds).toContain("Child");
  });

  it("detects spouse relationships from shared children", () => {
    const persons: RawPerson[] = [
      { wiki_id: "Husband", name: "Husband", gender: "Male" },
      { wiki_id: "Wife", name: "Wife", gender: "Female" },
      {
        wiki_id: "Child1",
        name: "Child 1",
        gender: "Male",
        father_wiki_id: "Husband",
        mother_wiki_id: "Wife",
      },
      {
        wiki_id: "Child2",
        name: "Child 2",
        gender: "Female",
        father_wiki_id: "Husband",
        mother_wiki_id: "Wife",
      },
    ];

    const result = buildTreeState(persons, "Husband");

    const husband = result.nodes.get("Husband")!;
    const wife = result.nodes.get("Wife")!;

    expect(husband.spouseIds).toContain("Wife");
    expect(wife.spouseIds).toContain("Husband");
    // Should not duplicate spouse entries
    expect(husband.spouseIds.length).toBe(1);
    expect(wife.spouseIds.length).toBe(1);
  });

  it("handles missing parent references gracefully", () => {
    const persons: RawPerson[] = [
      { wiki_id: "Child", name: "Child", gender: "Male", father_wiki_id: "MissingFather" },
    ];

    const result = buildTreeState(persons, "Child");

    const child = result.nodes.get("Child")!;
    // Parent not in dataset, so shouldn't be added to parentIds
    expect(child.parentIds).not.toContain("MissingFather");
  });

  it("initializes nodes with correct default values", () => {
    const persons: RawPerson[] = [{ wiki_id: "A", name: "Test", gender: "Male" }];

    const result = buildTreeState(persons, "A");

    const node = result.nodes.get("A")!;

    expect(node.x).toBe(0);
    expect(node.y).toBe(0);
    expect(node.width).toBe(0);
    expect(node.height).toBe(0);
    expect(node.collapsed).toBe(false);
    expect(node.selected).toBe(false);
    expect(node.highlighted).toBe(false);
  });

  it("sets correct rootId", () => {
    const persons: RawPerson[] = [
      { wiki_id: "Root", name: "Root Person", gender: "Male" },
      { wiki_id: "Other", name: "Other Person", gender: "Female" },
    ];

    const result = buildTreeState(persons, "Root");

    expect(result.rootId).toBe("Root");
  });

  it("initializes empty edges and generations", () => {
    const persons: RawPerson[] = [{ wiki_id: "A", name: "Test", gender: "Male" }];

    const result = buildTreeState(persons, "A");

    expect(result.edges.size).toBe(0);
    expect(result.generations.size).toBe(0);
  });

  it("handles multiple generations correctly", () => {
    const persons: RawPerson[] = [
      { wiki_id: "G1", name: "Grandparent", gender: "Male" },
      { wiki_id: "P1", name: "Parent", gender: "Male", father_wiki_id: "G1" },
      { wiki_id: "C1", name: "Child", gender: "Male", father_wiki_id: "P1" },
    ];

    const result = buildTreeState(persons, "G1");

    const grandparent = result.nodes.get("G1")!;
    const parent = result.nodes.get("P1")!;
    const child = result.nodes.get("C1")!;

    expect(grandparent.childIds).toContain("P1");
    expect(parent.parentIds).toContain("G1");
    expect(parent.childIds).toContain("C1");
    expect(child.parentIds).toContain("P1");
  });
});
