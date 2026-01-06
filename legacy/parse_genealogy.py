"""
Parse the OCR text from the Funk Family History book and extract genealogical data.
Creates a structured family tree output.
"""
import re
from collections import defaultdict

def parse_funk_genealogy(filename):
    """Parse the OCR text and extract family members."""

    with open(filename, 'r', encoding='utf-8') as f:
        text = f.read()

    # Split into lines
    lines = text.split('\n')

    # Pattern to match generation markers and names
    # Matches: I. Name, II. Name, III. Name, etc. (including lowercase variants from OCR)
    gen_pattern = re.compile(r'^(I{1,3}|IV|V|VI{0,3}|i{1,3}|iv|v|vi{0,3}|W|WI|Wl|Vil|VII|VIII)\.\s+(.+)', re.IGNORECASE)

    # Pattern to extract birth info
    birth_pattern = re.compile(r'bn\.?\s*(?:in\s+[\w\s,]+,?\s*)?([A-Za-z]+\.?\s*\d{1,2},?\s*\d{4}|\d{4}|[A-Za-z]+,?\s*\d{4})', re.IGNORECASE)

    # Pattern to extract death info
    death_pattern = re.compile(r'(?:died|dec\'?d)\.?\s*([A-Za-z]+\.?\s*\d{1,2},?\s*\d{4}|\d{4})', re.IGNORECASE)

    # Pattern to extract marriage info
    marriage_pattern = re.compile(r'[Mm]rd\.?\s+([^,\.]+(?:,\s*[A-Za-z]+\.?\s*\d{1,2},?\s*\d{4})?)', re.IGNORECASE)

    # Track all persons found
    persons = []
    current_section = "Unknown"

    # Track section headers
    section_pattern = re.compile(r'DESCENDANTS OF\s+(\w+\s+\w+)', re.IGNORECASE)

    for i, line in enumerate(lines):
        line = line.strip()

        # Check for section headers
        section_match = section_pattern.search(line)
        if section_match:
            current_section = section_match.group(1)
            continue

        # Check for generation entries
        gen_match = gen_pattern.match(line)
        if gen_match:
            gen_marker = gen_match.group(1).upper()
            rest_of_line = gen_match.group(2)

            # Normalize generation markers
            gen_map = {
                'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
                'VI': 6, 'VII': 7, 'VIII': 8,
                'W': 4, 'WI': 6, 'WL': 6, 'VIL': 7, 'VIL': 7
            }
            generation = gen_map.get(gen_marker, 0)

            # Get context (next few lines)
            context = rest_of_line
            for j in range(1, 5):
                if i + j < len(lines):
                    next_line = lines[i + j].strip()
                    if not gen_pattern.match(next_line) and next_line:
                        context += " " + next_line
                    else:
                        break

            # Extract name (first part before bn. or Mrd. or comma)
            name_match = re.match(r'^([A-Za-z\s\.]+?)(?:,|\s+bn\.|\s+[Mm]rd\.|\s+died|\s+\()', rest_of_line)
            if name_match:
                name = name_match.group(1).strip()
            else:
                name = rest_of_line.split(',')[0].strip()
                name = re.sub(r'\s+bn\..*', '', name)
                name = re.sub(r'\s+[Mm]rd\..*', '', name)

            # Clean up name
            name = re.sub(r'\s+', ' ', name).strip()

            # Extract birth
            birth = ""
            birth_match = birth_pattern.search(context)
            if birth_match:
                birth = birth_match.group(1)

            # Extract death
            death = ""
            death_match = death_pattern.search(context)
            if death_match:
                death = death_match.group(1)

            # Extract spouse
            spouse = ""
            spouse_match = marriage_pattern.search(context)
            if spouse_match:
                spouse = spouse_match.group(1).strip()
                # Clean up spouse name
                spouse = re.sub(r',\s*[A-Za-z]+\.?\s*\d{1,2},?\s*\d{4}.*', '', spouse)

            # Extract location
            location = ""
            loc_match = re.search(r'P\.?\s*[Oo]\.?,?\s*([^\.]+)', context)
            if loc_match:
                location = loc_match.group(1).strip()

            # Extract occupation
            occupation = ""
            occ_patterns = ['Farmer', 'Minister', 'Blacksmith', 'Teacher', 'Merchant',
                          'Carpenter', 'Miller', 'Doctor', 'Lawyer', 'Physician']
            for occ in occ_patterns:
                if occ.lower() in context.lower():
                    occupation = occ
                    break

            # Extract religion
            religion = ""
            rel_patterns = ['Menn', 'Mennonite', 'Lutheran', 'Luth', 'Methodist', 'Meth',
                          'Baptist', 'Bap', 'Presbyterian', 'Presby', 'Reformed', 'Ref']
            for rel in rel_patterns:
                if rel.lower() in context.lower():
                    if 'menn' in rel.lower():
                        religion = 'Mennonite'
                    elif 'luth' in rel.lower():
                        religion = 'Lutheran'
                    elif 'meth' in rel.lower():
                        religion = 'Methodist'
                    elif 'bap' in rel.lower():
                        religion = 'Baptist'
                    elif 'presb' in rel.lower():
                        religion = 'Presbyterian'
                    elif 'ref' in rel.lower():
                        religion = 'Reformed'
                    else:
                        religion = rel
                    break

            # Extract children list
            children = ""
            children_match = re.search(r'Children:?\s*([^\.]+(?:\.[^\.]+)?)', context, re.IGNORECASE)
            if children_match:
                children = children_match.group(1).strip()

            if name and len(name) > 2:
                persons.append({
                    'generation': generation,
                    'gen_marker': gen_marker,
                    'name': name,
                    'birth': birth,
                    'death': death,
                    'spouse': spouse,
                    'location': location,
                    'occupation': occupation,
                    'religion': religion,
                    'children': children,
                    'section': current_section
                })

    return persons


def generate_family_tree_md(persons, output_file):
    """Generate a comprehensive markdown family tree."""

    # Group by generation
    by_gen = defaultdict(list)
    for p in persons:
        by_gen[p['generation']].append(p)

    # Count unique surnames
    surnames = defaultdict(int)
    for p in persons:
        parts = p['name'].split()
        if parts:
            surnames[parts[-1]] += 1

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("# Complete Funk Family Tree\n")
        f.write("## From 'A Brief History of Bishop Henry Funck and Other Funk Pioneers' (1899)\n\n")
        f.write("---\n\n")

        # Statistics
        f.write("## Statistics\n\n")
        f.write(f"- **Total persons recorded:** {len(persons)}\n")
        f.write(f"- **Generations covered:** {max(by_gen.keys()) if by_gen else 0}\n")
        for gen in sorted(by_gen.keys()):
            f.write(f"  - Generation {gen}: {len(by_gen[gen])} persons\n")
        f.write(f"\n**Top surnames:** ")
        top_surnames = sorted(surnames.items(), key=lambda x: x[1], reverse=True)[:10]
        f.write(", ".join([f"{s} ({c})" for s, c in top_surnames]))
        f.write("\n\n---\n\n")

        # Generation I - The Patriarch
        f.write("## Generation I - The Patriarch\n\n")
        f.write("### BISHOP HENRY FUNCK (c. 1690 - 1760)\n\n")
        f.write("| Field | Details |\n")
        f.write("|-------|--------|\n")
        f.write("| **Birth** | c. 1690, Europe (Holland or Palatinate) |\n")
        f.write("| **Death** | 1760, Franconia Twp., Montgomery Co., PA |\n")
        f.write("| **Immigration** | 1719 |\n")
        f.write("| **Spouse** | Anne Meyer (d. July 8, 1768) |\n")
        f.write("| **Occupation** | Farmer, Mill Owner |\n")
        f.write("| **Religion** | Mennonite Bishop |\n")
        f.write("| **Location** | Indian Creek, Franconia Twp., Montgomery Co., PA |\n\n")

        f.write("**Children:**\n")
        f.write("1. John Funk\n")
        f.write("2. Henry Funk\n")
        f.write("3. Christian Funk\n")
        f.write("4. Abraham Funk\n")
        f.write("5. Barbara Funk\n")
        f.write("6. Anne Funk\n")
        f.write("7. Mary Funk\n")
        f.write("8. Fronicka (Veronica) Funk\n")
        f.write("9. Elizabeth Funk\n")
        f.write("10. Esther Funk\n\n")
        f.write("---\n\n")

        # Generation II - Children
        f.write("## Generation II - Children of Bishop Henry Funck\n\n")
        gen2 = [p for p in by_gen[2] if 'funk' in p['name'].lower()]

        # Add the known children
        children_ii = [
            ("John Funk", "Eldest son, blacksmith and farmer", "Hilltown Twp., Bucks Co., PA"),
            ("Henry Funk", "Second son, moved to Virginia 1786", "Rockingham Co., VA"),
            ("Christian Funk", "Third son, received 137 acres", "Franconia Twp., PA"),
            ("Abraham Funk", "Fourth son, received mill property", "Franconia Twp., PA"),
        ]

        for name, desc, loc in children_ii:
            f.write(f"### II. {name}\n")
            f.write(f"*{desc}*\n")
            f.write(f"- Location: {loc}\n\n")

        f.write("---\n\n")

        # Detailed listings by generation
        for gen in range(3, max(by_gen.keys()) + 1):
            if by_gen[gen]:
                f.write(f"## Generation {gen}\n\n")
                f.write(f"*{len(by_gen[gen])} persons recorded*\n\n")

                # Group by section/branch
                by_section = defaultdict(list)
                for p in by_gen[gen]:
                    by_section[p['section']].append(p)

                for section in sorted(by_section.keys()):
                    if section != "Unknown":
                        f.write(f"### Branch: {section}\n\n")

                    f.write("| Name | Birth | Death | Spouse | Location | Occupation |\n")
                    f.write("|------|-------|-------|--------|----------|------------|\n")

                    for p in by_section[section][:100]:  # Limit per section
                        name = p['name'][:30] if p['name'] else "-"
                        birth = p['birth'][:15] if p['birth'] else "-"
                        death = p['death'][:15] if p['death'] else "-"
                        spouse = p['spouse'][:25] if p['spouse'] else "-"
                        loc = p['location'][:20] if p['location'] else "-"
                        occ = p['occupation'][:15] if p['occupation'] else "-"

                        f.write(f"| {name} | {birth} | {death} | {spouse} | {loc} | {occ} |\n")

                    if len(by_section[section]) > 100:
                        f.write(f"\n*...and {len(by_section[section]) - 100} more*\n")
                    f.write("\n")

                f.write("---\n\n")

        # Notable persons
        f.write("## Notable Persons\n\n")

        ministers = [p for p in persons if 'minister' in p['occupation'].lower() or 'rev.' in p['name'].lower()]
        if ministers:
            f.write("### Ministers and Religious Leaders\n\n")
            for p in ministers[:30]:
                f.write(f"- **{p['name']}** (Gen {p['generation']})")
                if p['birth']:
                    f.write(f" - b. {p['birth']}")
                if p['location']:
                    f.write(f" - {p['location']}")
                f.write("\n")
            f.write("\n")

        # Index of Funk surnames
        f.write("## Index of Direct Funk Line\n\n")
        funks = [p for p in persons if p['name'].lower().endswith('funk')]
        by_gen_funk = defaultdict(list)
        for p in funks:
            by_gen_funk[p['generation']].append(p)

        for gen in sorted(by_gen_funk.keys()):
            f.write(f"### Generation {gen}\n\n")
            for p in sorted(by_gen_funk[gen], key=lambda x: x['name']):
                f.write(f"- {p['name']}")
                if p['birth']:
                    f.write(f" (b. {p['birth']})")
                if p['spouse']:
                    f.write(f" m. {p['spouse']}")
                f.write("\n")
            f.write("\n")

        f.write("\n---\n")
        f.write("\n*Generated from OCR text of 'Fretz History of Bishop Henry Funck.pdf'*\n")

    return len(persons)


if __name__ == "__main__":
    print("Parsing OCR text...")
    persons = parse_funk_genealogy(r"C:\Users\norca\dev\funk-tree\funk-history-ocr.txt")
    print(f"Found {len(persons)} persons")

    print("Generating family tree markdown...")
    count = generate_family_tree_md(persons, r"C:\Users\norca\dev\funk-tree\COMPLETE_FAMILY_TREE.md")
    print(f"Complete! Generated family tree with {count} persons")
