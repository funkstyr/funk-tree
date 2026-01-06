"""
Convert WikiTree crawler data to visualization-compatible format.
Creates funk_tree.json and funk_tree_d3.json from the WikiTree data.
"""

import json
from collections import deque, defaultdict
from datetime import datetime
import os


def load_wikitree_data(progress_file):
    """Load data from WikiTree crawler."""
    with open(progress_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data.get('persons', {})


def convert_to_visualization_format(wikitree_persons):
    """Convert WikiTree data to our visualization format."""
    persons = {}

    # Create mapping from numeric IDs to WikiTree IDs
    numeric_to_wiki = {}
    for wiki_id, wt_person in wikitree_persons.items():
        numeric_id = wt_person.get('id')
        if numeric_id:
            numeric_to_wiki[str(numeric_id)] = wiki_id

    # Map WikiTree IDs to our simple IDs
    id_map = {}
    counter = 0

    for wiki_id, wt_person in wikitree_persons.items():
        counter += 1
        our_id = f"P{counter:05d}"
        id_map[wiki_id] = our_id

    # First pass: create all persons
    for wiki_id, wt_person in wikitree_persons.items():
        our_id = id_map.get(wiki_id)
        if not our_id:
            continue

        # Resolve parent WikiTree IDs from numeric IDs
        father_numeric = wt_person.get('father_id')
        mother_numeric = wt_person.get('mother_id')

        parent_ids = []
        if father_numeric and father_numeric != 0:
            father_wiki = numeric_to_wiki.get(str(father_numeric))
            if father_wiki and father_wiki in id_map:
                parent_ids.append(id_map[father_wiki])
        if mother_numeric and mother_numeric != 0:
            mother_wiki = numeric_to_wiki.get(str(mother_numeric))
            if mother_wiki and mother_wiki in id_map:
                parent_ids.append(id_map[mother_wiki])

        # Resolve child WikiTree IDs from numeric IDs
        child_ids = []
        for child_numeric in wt_person.get('child_ids', []):
            if child_numeric:
                child_wiki = numeric_to_wiki.get(str(child_numeric))
                if child_wiki and child_wiki in id_map:
                    child_ids.append(id_map[child_wiki])

        # Resolve spouse WikiTree IDs from numeric IDs
        spouse_ids = []
        for spouse_numeric in wt_person.get('spouse_ids', []):
            if spouse_numeric:
                spouse_wiki = numeric_to_wiki.get(str(spouse_numeric))
                if spouse_wiki and spouse_wiki in id_map:
                    spouse_ids.append(id_map[spouse_wiki])

        # Parse dates for year extraction
        birth_year = extract_year(wt_person.get('birth_date', ''))
        death_year = extract_year(wt_person.get('death_date', ''))

        persons[our_id] = {
            'id': our_id,
            'wiki_id': wiki_id,
            'name': wt_person.get('name', 'Unknown'),
            'first_name': wt_person.get('first_name', ''),
            'last_name': wt_person.get('last_name_birth', '') or wt_person.get('last_name_current', ''),
            'gender': wt_person.get('gender', 'Unknown')[0] if wt_person.get('gender') else 'U',
            'generation': wt_person.get('generation', -1),
            'birth_date': wt_person.get('birth_date', ''),
            'death_date': wt_person.get('death_date', ''),
            'birth_year': birth_year,
            'death_year': death_year,
            'birth_place': wt_person.get('birth_location', ''),
            'death_place': wt_person.get('death_location', ''),
            'location': wt_person.get('birth_location', ''),
            'occupation': '',
            'religion': '',
            'parent_ids': parent_ids,
            'spouse_ids': spouse_ids,
            'child_ids': child_ids,
            'family_ids': [],
            'is_living': wt_person.get('is_living', 0)
        }

    # Second pass: build child_ids from parent relationships
    # This ensures bidirectional linking
    for our_id, person in persons.items():
        for parent_id in person['parent_ids']:
            if parent_id in persons:
                if our_id not in persons[parent_id]['child_ids']:
                    persons[parent_id]['child_ids'].append(our_id)

    return persons, id_map


def extract_year(date_str):
    """Extract year from date string."""
    if not date_str:
        return None
    # WikiTree format: YYYY-MM-DD
    if '-' in str(date_str):
        parts = str(date_str).split('-')
        if parts[0].isdigit() and len(parts[0]) == 4:
            return int(parts[0])
    return None


def calculate_generations(persons, root_id):
    """Calculate generation numbers using BFS from root."""
    visited = set()
    queue = deque([(root_id, 0)])

    while queue:
        person_id, gen = queue.popleft()

        if person_id in visited or person_id not in persons:
            continue

        visited.add(person_id)
        persons[person_id]['generation'] = gen

        # Add children
        for child_id in persons[person_id].get('child_ids', []):
            if child_id not in visited:
                queue.append((child_id, gen + 1))

    return persons


def export_d3_hierarchy(persons, root_id, output_file):
    """Export in D3.js hierarchy format."""

    def build_subtree(person_id, visited=None):
        if visited is None:
            visited = set()

        if person_id in visited or person_id not in persons:
            return None
        visited.add(person_id)

        person = persons[person_id]

        node = {
            "id": person_id,
            "name": person['name'],
            "data": {
                "birth": person['birth_date'],
                "death": person['death_date'],
                "gender": person['gender'],
                "occupation": person.get('occupation', ''),
                "location": person.get('location', ''),
                "generation": person['generation'],
                "wiki_id": person.get('wiki_id', '')
            },
            "children": []
        }

        for child_id in person.get('child_ids', []):
            child_node = build_subtree(child_id, visited)
            if child_node:
                node["children"].append(child_node)

        return node

    tree = build_subtree(root_id)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(tree, f, indent=2, ensure_ascii=False)

    return tree


def main():
    """Main entry point."""
    base_path = r"C:\Users\norca\dev\funk-tree"
    wikitree_file = os.path.join(base_path, "wikitree_data", "progress.json")
    json_output = os.path.join(base_path, "funk_tree.json")
    d3_output = os.path.join(base_path, "funk_tree_d3.json")

    print("=" * 60)
    print("WIKITREE DATA CONVERTER")
    print("=" * 60)
    print()

    # Load WikiTree data
    print(f"Loading WikiTree data from: {wikitree_file}")
    wikitree_persons = load_wikitree_data(wikitree_file)
    print(f"  Loaded {len(wikitree_persons)} profiles")

    # Convert to visualization format
    print("\nConverting to visualization format...")
    persons, id_map = convert_to_visualization_format(wikitree_persons)
    print(f"  Converted {len(persons)} persons")

    # Find root (Bishop Henry Funck)
    root_id = None
    for pid, person in persons.items():
        if person.get('wiki_id') == 'Funck-6':
            root_id = pid
            break

    if not root_id:
        # Find person with no parents
        for pid, person in persons.items():
            if not person.get('parent_ids'):
                root_id = pid
                break

    print(f"  Root person: {persons.get(root_id, {}).get('name', 'Unknown')} ({root_id})")

    # Calculate generations
    print("\nCalculating generations...")
    persons = calculate_generations(persons, root_id)

    # Statistics
    by_gen = defaultdict(int)
    for p in persons.values():
        gen = p.get('generation', -1)
        by_gen[gen] += 1

    print("\nBy Generation:")
    for gen in sorted(by_gen.keys()):
        if gen >= 0:
            print(f"  Gen {gen}: {by_gen[gen]}")

    # Export JSON
    print(f"\nExporting to JSON: {json_output}")

    persons_with_parents = sum(1 for p in persons.values() if p['parent_ids'])
    persons_with_children = sum(1 for p in persons.values() if p['child_ids'])

    data = {
        "metadata": {
            "title": "Funk Family Tree (WikiTree)",
            "source": "WikiTree (https://www.wikitree.com/wiki/Funck-6)",
            "generated": datetime.now().isoformat(),
            "total_persons": len(persons),
            "persons_with_parents": persons_with_parents,
            "persons_with_children": persons_with_children,
            "generations": dict(sorted((k, v) for k, v in by_gen.items() if k >= 0))
        },
        "persons": persons,
        "families": {}
    }

    with open(json_output, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    # Export D3 hierarchy
    print(f"Exporting D3 hierarchy: {d3_output}")
    export_d3_hierarchy(persons, root_id, d3_output)

    print("\nDone!")
    print(f"  - Main JSON: {json_output}")
    print(f"  - D3 Hierarchy: {d3_output}")


if __name__ == "__main__":
    main()
