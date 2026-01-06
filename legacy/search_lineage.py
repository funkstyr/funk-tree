"""
Search WikiTree data for Michael Funk's lineage ancestors.
Looks for potential matches to fill in the gap between Aaron Funk (1835) and Bishop Henry Funck.
"""

import json
import os
import re
from datetime import datetime

# Target ancestors to search for
TARGET_ANCESTORS = [
    {"name": "Aaron Funk", "birth_year": 1835, "spouse": "Elizabeth Frick", "wiki_id": "Funk-2731"},
    {"name": "John H. Funk", "birth_year": 1807, "spouse": "Nancy Anna Shank"},
    {"name": "Henry George Funk", "birth_year": 1784, "spouse": "Elisabeth Margaret Good"},
    {"name": "John Funk", "birth_year": 1759, "spouse": "Prudentia Miller", "notes": "Rev./Pvt."},
    {"name": "Henry Funk", "birth_year": 1732, "spouse": "Martha Ann Killheffer OR Margaretha Ziegler"},
]

# Known confirmed ancestors
CONFIRMED = {
    "Funk-2731": {"name": "Aaron Funk", "birth": "1835-04-29", "spouse": "Elizabeth Frick (Frick-287)"},
    "Funck-6": {"name": "Bishop Heinrich Funck", "birth": "~1694/1702", "spouse": "Anna Meyer"},
    "Funk-19": {"name": "Heinrich Funk Jr.", "birth": "1730-05-30", "spouse": "Barbara Showalter"},
}


def load_wikitree_data(progress_file):
    """Load WikiTree crawler data."""
    with open(progress_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data.get('persons', {})


def extract_year(date_str):
    """Extract year from date string."""
    if not date_str:
        return None
    match = re.search(r'\b(1[5-9]\d{2})\b', str(date_str))
    return int(match.group(1)) if match else None


def search_for_ancestors(persons):
    """Search for target ancestors in WikiTree data."""
    results = {
        "exact_matches": [],
        "possible_matches": [],
        "related_funks": [],
    }

    for wiki_id, person in persons.items():
        name = person.get('name', '')
        birth = person.get('birth_date', '')
        birth_year = extract_year(birth)
        spouse_ids = person.get('spouse_ids', [])

        # Search for each target ancestor
        for target in TARGET_ANCESTORS:
            target_year = target['birth_year']
            target_name_parts = target['name'].lower().split()

            # Check name match
            name_lower = name.lower()
            name_match = all(part in name_lower for part in target_name_parts)

            if not name_match:
                continue

            # Check year match (within 5 years)
            year_match = False
            if birth_year and abs(birth_year - target_year) <= 5:
                year_match = True

            # Record the match
            match_info = {
                "wiki_id": wiki_id,
                "name": name,
                "birth": birth,
                "target": target['name'],
                "target_year": target_year,
                "birth_year": birth_year,
                "spouse_ids": spouse_ids,
                "father_id": person.get('father_id'),
                "mother_id": person.get('mother_id'),
                "child_ids": person.get('child_ids', []),
            }

            if year_match:
                if birth_year == target_year:
                    results["exact_matches"].append(match_info)
                else:
                    results["possible_matches"].append(match_info)
            elif name_match:
                results["related_funks"].append(match_info)

    return results


def search_by_criteria(persons, first_name=None, birth_year_range=None, spouse_name=None):
    """Search with flexible criteria."""
    matches = []

    for wiki_id, person in persons.items():
        name = person.get('name', '')
        birth = person.get('birth_date', '')
        birth_year = extract_year(birth)

        # Check first name
        if first_name:
            first = name.split()[0].lower() if name else ""
            if first_name.lower() not in first:
                continue

        # Check birth year range
        if birth_year_range:
            min_year, max_year = birth_year_range
            if not birth_year or birth_year < min_year or birth_year > max_year:
                continue

        matches.append({
            "wiki_id": wiki_id,
            "name": name,
            "birth": birth,
            "birth_year": birth_year,
            "father_id": person.get('father_id'),
            "mother_id": person.get('mother_id'),
        })

    return matches


def trace_ancestry(persons, start_id, max_depth=10):
    """Trace ancestry from a starting person."""
    ancestry = []
    current_id = start_id

    for depth in range(max_depth):
        person = persons.get(current_id)
        if not person:
            break

        ancestry.append({
            "depth": depth,
            "wiki_id": current_id,
            "name": person.get('name'),
            "birth": person.get('birth_date'),
        })

        # Get father
        father_id = person.get('father_id')
        if not father_id or father_id == 0:
            break

        # Find father by numeric ID
        father_wiki = None
        for wid, p in persons.items():
            if p.get('id') == father_id:
                father_wiki = wid
                break

        if not father_wiki:
            ancestry.append({
                "depth": depth + 1,
                "note": f"Father ID {father_id} not in dataset"
            })
            break

        current_id = father_wiki

    return ancestry


def main():
    """Main search function."""
    base_path = r"C:\Users\norca\dev\funk-tree"
    progress_file = os.path.join(base_path, "wikitree_data", "progress.json")

    print("=" * 70)
    print("MICHAEL FUNK LINEAGE SEARCH")
    print("=" * 70)
    print()

    # Load data
    print(f"Loading WikiTree data from: {progress_file}")
    persons = load_wikitree_data(progress_file)
    print(f"Loaded {len(persons)} profiles")
    print()

    # Search for target ancestors
    print("=" * 70)
    print("SEARCHING FOR TARGET ANCESTORS")
    print("=" * 70)

    results = search_for_ancestors(persons)

    print(f"\nExact year matches: {len(results['exact_matches'])}")
    for match in results['exact_matches']:
        print(f"  {match['wiki_id']}: {match['name']} (b. {match['birth']})")
        print(f"    Target: {match['target']} (b. {match['target_year']})")

    print(f"\nPossible matches (within 5 years): {len(results['possible_matches'])}")
    for match in results['possible_matches'][:10]:
        print(f"  {match['wiki_id']}: {match['name']} (b. {match['birth']})")
        print(f"    Target: {match['target']} (b. {match['target_year']})")

    # Search for John Funks
    print()
    print("=" * 70)
    print("SEARCHING FOR JOHN FUNKS (1750-1820)")
    print("=" * 70)

    johns = search_by_criteria(persons, first_name="John", birth_year_range=(1750, 1820))
    print(f"\nFound {len(johns)} John Funks:")
    for j in johns[:15]:
        print(f"  {j['wiki_id']}: {j['name']} (b. {j['birth']})")
        if j['father_id']:
            print(f"    Father ID: {j['father_id']}")

    # Search for Henry Funks
    print()
    print("=" * 70)
    print("SEARCHING FOR HENRY FUNKS (1720-1800)")
    print("=" * 70)

    henrys = search_by_criteria(persons, first_name="Henry", birth_year_range=(1720, 1800))
    henrys += search_by_criteria(persons, first_name="Heinrich", birth_year_range=(1720, 1800))
    print(f"\nFound {len(henrys)} Henry/Heinrich Funks:")
    for h in henrys[:15]:
        print(f"  {h['wiki_id']}: {h['name']} (b. {h['birth']})")

    # Trace ancestry from confirmed Aaron Funk
    print()
    print("=" * 70)
    print("TRACING ANCESTRY FROM AARON FUNK (Funk-2731)")
    print("=" * 70)

    if "Funk-2731" in persons:
        ancestry = trace_ancestry(persons, "Funk-2731")
        print("\nAncestry trace:")
        for a in ancestry:
            indent = "  " * a.get('depth', 0)
            if 'name' in a:
                print(f"{indent}{a['wiki_id']}: {a['name']} (b. {a['birth']})")
            else:
                print(f"{indent}{a.get('note', 'Unknown')}")
    else:
        print("\nAaron Funk (Funk-2731) not in current dataset.")
        print("Run the crawler with 'Funk-2731' as a starting point.")

    # Check confirmed connections
    print()
    print("=" * 70)
    print("CONFIRMED CONNECTIONS IN DATASET")
    print("=" * 70)

    for wiki_id, info in CONFIRMED.items():
        if wiki_id in persons:
            print(f"\n[FOUND] {info['name']}")
            p = persons[wiki_id]
            print(f"  WikiTree ID: {wiki_id}")
            print(f"  Name in data: {p.get('name')}")
            print(f"  Birth: {p.get('birth_date')}")
            print(f"  Children: {len(p.get('child_ids', []))}")
        else:
            print(f"\n[NOT IN DATA] {info['name']} ({wiki_id})")

    print()
    print("=" * 70)
    print("RECOMMENDATIONS")
    print("=" * 70)
    print("""
1. If Aaron Funk (Funk-2731) parents are still unknown:
   - Continue running wikitree_crawler.py to fetch more profiles
   - Search census records for Aaron Funk in 1850 (age ~15 with parents)

2. To add your family line to WikiTree:
   - Create a free account at wikitree.com
   - Add your known ancestors starting from Donald Lee Funk
   - Link Aaron Funk (Funk-2731) as his ancestor

3. Key profiles to investigate further:
   - Funk-19 (Heinrich Funk Jr., b. 1730) - Confirmed son of Bishop Henry
   - Check his son John (b. 1764) for connections to your line
""")


if __name__ == "__main__":
    main()
