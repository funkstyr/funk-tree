"""
Enhanced parser to create linked family tree JSON from OCR text.
Creates a JSON structure with explicit parent-child relationships for visualization.
"""
import re
import json
from collections import defaultdict
from datetime import datetime

# ============================================================================
# GENDER INFERENCE DATA
# ============================================================================

MALE_NAMES = {
    'John', 'Henry', 'Jacob', 'Abraham', 'Christian', 'Samuel', 'David', 'Joseph',
    'Daniel', 'Isaac', 'William', 'Michael', 'Peter', 'George', 'Benjamin', 'Elias',
    'Jonas', 'Martin', 'Philip', 'Andrew', 'Charles', 'James', 'Thomas', 'Edward',
    'Francis', 'Frederick', 'Albert', 'Amos', 'Aaron', 'Adam', 'Calvin', 'Edwin',
    'Eli', 'Franklin', 'Howard', 'Irvin', 'Jesse', 'Levi', 'Milton', 'Nathan',
    'Oliver', 'Oscar', 'Owen', 'Paul', 'Robert', 'Solomon', 'Stephen', 'Timothy',
    'Walter', 'Wesley', 'Hiram', 'Tobias', 'Matthias', 'Menno', 'Abram', 'Jonathan',
    'Cornelius', 'Gideon', 'Moses', 'Jeremiah', 'Ephraim', 'Reuben', 'Simon', 'Job',
    'Noah', 'Enoch', 'Josiah', 'Ezra', 'Seth', 'Joel', 'Silas', 'Cyrus', 'Jerome',
    'Ira', 'Allen', 'Harvey', 'Harry', 'Frank', 'Lewis', 'Lloyd', 'Warren', 'Homer',
    'Earl', 'Roy', 'Ray', 'Lee', 'Carl', 'Herman', 'Clarence', 'Vernon', 'Willis',
    'Ulysses', 'Perry', 'Ervin', 'Irwin', 'Alvin', 'Melvin', 'Marvin', 'Edwin',
    'Conrad', 'Gottlieb', 'Heinrich', 'Johann', 'Hans', 'Wilhelm', 'Friedrich',
    'Rev', 'Bishop', 'Deacon', 'Elder'
}

FEMALE_NAMES = {
    'Mary', 'Elizabeth', 'Anna', 'Sarah', 'Barbara', 'Catharine', 'Catherine',
    'Susanna', 'Susannah', 'Hannah', 'Margaret', 'Rebecca', 'Rachel', 'Esther',
    'Martha', 'Maria', 'Nancy', 'Jane', 'Lydia', 'Emma', 'Ellen', 'Frances',
    'Fannie', 'Annie', 'Sallie', 'Lizzie', 'Katie', 'Maggie', 'Hettie', 'Lottie',
    'Minnie', 'Jennie', 'Carrie', 'Mattie', 'Ida', 'Eva', 'Clara', 'Laura',
    'Ella', 'Alice', 'Susan', 'Sophia', 'Leah', 'Ruth', 'Eliza', 'Amanda',
    'Caroline', 'Charlotte', 'Louisa', 'Amelia', 'Julia', 'Rosa', 'Kate',
    'Lena', 'Edna', 'Mabel', 'Florence', 'Grace', 'Helen', 'Bertha', 'Agnes',
    'Adeline', 'Angeline', 'Emeline', 'Magdalena', 'Veronica', 'Fronicka',
    'Anne', 'Ann', 'Sue', 'Polly', 'Mollie', 'Franey', 'Christiana', 'Naomi',
    'Harriet', 'Henrietta', 'Priscilla', 'Phoebe', 'Dora', 'Nora', 'Cora',
    'Effie', 'Sadie', 'Stella', 'Nellie', 'Lillie', 'Mamie', 'Pearl', 'Maud',
    'Maude', 'Gertrude', 'Hilda', 'Rosa', 'Rosie', 'Rosetta', 'Violet', 'Daisy',
    'Lucy', 'Lucinda', 'Malinda', 'Matilda', 'Priscilla', 'Tabitha', 'Abigail'
}


class FamilyTreeParser:
    """Enhanced parser that creates linked family tree structure."""

    def __init__(self):
        self.persons = {}
        self.families = {}
        self.person_counter = 0
        self.family_counter = 0
        self.current_section = "Unknown"
        self.section_stack = []  # Track parent context by generation

    def generate_person_id(self):
        """Generate unique person ID."""
        self.person_counter += 1
        return f"P{self.person_counter:05d}"

    def generate_family_id(self):
        """Generate unique family ID."""
        self.family_counter += 1
        return f"F{self.family_counter:05d}"

    def infer_gender(self, name):
        """Infer gender from first name."""
        if not name:
            return 'U'

        # Extract first name
        first_name = name.split()[0] if name else ""

        # Remove titles
        if first_name in ('Rev', 'Rev.', 'Bishop', 'Deacon', 'Elder', 'Dr', 'Dr.'):
            parts = name.split()
            first_name = parts[1] if len(parts) > 1 else ""

        # Check against known names
        if first_name in MALE_NAMES:
            return 'M'
        elif first_name in FEMALE_NAMES:
            return 'F'

        # Check for common endings
        if first_name.endswith(('a', 'ie', 'ey', 'y')) and first_name not in ('Henry', 'Harry', 'Perry'):
            return 'F'

        return 'U'  # Unknown

    def extract_first_name(self, full_name):
        """Extract first name from full name."""
        if not full_name:
            return ""
        parts = full_name.split()
        if parts[0] in ('Rev', 'Rev.', 'Bishop', 'Deacon', 'Elder', 'Dr', 'Dr.'):
            return parts[1] if len(parts) > 1 else parts[0]
        return parts[0]

    def extract_last_name(self, full_name):
        """Extract last name from full name."""
        if not full_name:
            return ""
        parts = full_name.split()
        return parts[-1] if parts else ""

    def parse_children_list(self, children_text):
        """Extract individual children names from children list text."""
        if not children_text:
            return []

        # Remove common suffixes and clean up
        children_text = re.sub(r'\s+and\s+', ', ', children_text, flags=re.IGNORECASE)
        children_text = re.sub(r'\s*\(.*?\)\s*', ' ', children_text)

        # Extract names (capitalized words)
        names = re.findall(r'([A-Z][a-z]+)', children_text)

        # Filter out common non-name words
        non_names = {'Children', 'Issue', 'And', 'The', 'With', 'Born', 'Died', 'Twin', 'Twins'}
        names = [n for n in names if n not in non_names]

        return names

    def create_person(self, name, generation, birth="", death="", spouse="",
                      location="", occupation="", religion="", children_text="",
                      section="", line_num=0):
        """Create a person record with unique ID."""
        person_id = self.generate_person_id()

        person = {
            'id': person_id,
            'name': name,
            'first_name': self.extract_first_name(name),
            'last_name': self.extract_last_name(name),
            'gender': self.infer_gender(name),
            'generation': generation,
            'birth_date': birth,
            'death_date': death,
            'birth_place': "",
            'death_place': "",
            'location': location,
            'occupation': occupation,
            'religion': religion,
            'spouse_name': spouse,
            'children_text': children_text,
            'section': section,
            'parent_ids': [],
            'spouse_ids': [],
            'child_ids': [],
            'family_ids': [],
            'source_line': line_num,
            'needs_review': False
        }

        self.persons[person_id] = person
        return person_id

    def create_family(self, husband_id=None, wife_id=None, child_ids=None, marriage_date=""):
        """Create a family unit."""
        family_id = self.generate_family_id()

        family = {
            'id': family_id,
            'husband_id': husband_id,
            'wife_id': wife_id,
            'child_ids': child_ids or [],
            'marriage_date': marriage_date,
            'marriage_place': ""
        }

        self.families[family_id] = family

        # Update person records
        if husband_id and husband_id in self.persons:
            self.persons[husband_id]['family_ids'].append(family_id)
            if wife_id:
                self.persons[husband_id]['spouse_ids'].append(wife_id)

        if wife_id and wife_id in self.persons:
            self.persons[wife_id]['family_ids'].append(family_id)
            if husband_id:
                self.persons[wife_id]['spouse_ids'].append(husband_id)

        return family_id

    def link_parent_child(self, parent_id, child_id):
        """Establish bidirectional parent-child link."""
        if parent_id in self.persons and child_id in self.persons:
            if child_id not in self.persons[parent_id]['child_ids']:
                self.persons[parent_id]['child_ids'].append(child_id)
            if parent_id not in self.persons[child_id]['parent_ids']:
                self.persons[child_id]['parent_ids'].append(parent_id)

    def parse_ocr_file(self, filename):
        """Main parsing logic with relationship inference."""

        with open(filename, 'r', encoding='utf-8') as f:
            text = f.read()

        lines = text.split('\n')

        # Patterns
        gen_pattern = re.compile(
            r'^(I{1,3}|IV|V|VI{0,3}|VII|VIII|i{1,3}|iv|v|vi{0,3}|W|WI|Wl|Vil)\.\s+(.+)',
            re.IGNORECASE
        )
        section_pattern = re.compile(r'DESCENDANTS OF\s+(.+?)(?:,|\.|$)', re.IGNORECASE)
        birth_pattern = re.compile(
            r'bn\.?\s*(?:in\s+[\w\s,]+,?\s*)?([A-Za-z]+\.?\s*\d{1,2},?\s*\d{4}|\d{4}|[A-Za-z]+,?\s*\d{4})',
            re.IGNORECASE
        )
        death_pattern = re.compile(
            r'(?:died|dec\'?d)\.?\s*([A-Za-z]+\.?\s*\d{1,2},?\s*\d{4}|\d{4})',
            re.IGNORECASE
        )
        marriage_pattern = re.compile(r'[Mm]rd\.?\s+([^,\.]+)', re.IGNORECASE)
        children_pattern = re.compile(r'Children:?\s*([^\.]+(?:\.[^\.]+)?)', re.IGNORECASE)
        location_pattern = re.compile(r'P\.?\s*[Oo]\.?,?\s*([^\.]+)', re.IGNORECASE)

        gen_map = {
            'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8,
            'W': 4, 'WI': 6, 'WL': 6, 'VIL': 7
        }

        # Track context for parent-child inference
        parent_stack = {}  # generation -> most recent person at that generation
        current_section = "Unknown"
        section_root_gen = 2  # Default root generation for sections

        # First pass: create all persons
        print("Pass 1: Extracting persons...")

        for i, line in enumerate(lines):
            line = line.strip()

            # Check for section headers
            section_match = section_pattern.search(line)
            if section_match:
                current_section = section_match.group(1).strip()
                parent_stack = {}  # Reset parent tracking for new section
                continue

            # Check for generation entries
            gen_match = gen_pattern.match(line)
            if gen_match:
                gen_marker = gen_match.group(1).upper()
                rest_of_line = gen_match.group(2)

                # Normalize generation
                generation = gen_map.get(gen_marker, 0)
                if generation == 0:
                    continue

                # Get context (next few lines)
                context = rest_of_line
                for j in range(1, 5):
                    if i + j < len(lines):
                        next_line = lines[i + j].strip()
                        if not gen_pattern.match(next_line) and next_line:
                            context += " " + next_line
                        else:
                            break

                # Extract name
                name_match = re.match(
                    r'^([A-Za-z\s\.]+?)(?:,|\s+bn\.|\s+[Mm]rd\.|\s+died|\s+\(|\s+dec)',
                    rest_of_line
                )
                if name_match:
                    name = name_match.group(1).strip()
                else:
                    name = rest_of_line.split(',')[0].strip()
                    name = re.sub(r'\s+bn\..*', '', name)
                    name = re.sub(r'\s+[Mm]rd\..*', '', name)

                name = re.sub(r'\s+', ' ', name).strip()

                # Skip invalid names
                if not name or len(name) < 2:
                    continue
                if name.lower() in ('children', 'issue', 'and', 'the'):
                    continue

                # Extract other fields
                birth = ""
                birth_match = birth_pattern.search(context)
                if birth_match:
                    birth = birth_match.group(1)

                death = ""
                death_match = death_pattern.search(context)
                if death_match:
                    death = death_match.group(1)

                spouse = ""
                spouse_match = marriage_pattern.search(context)
                if spouse_match:
                    spouse = spouse_match.group(1).strip()
                    spouse = re.sub(r',\s*[A-Za-z]+\.?\s*\d{1,2},?\s*\d{4}.*', '', spouse)

                location = ""
                loc_match = location_pattern.search(context)
                if loc_match:
                    location = loc_match.group(1).strip()[:50]

                occupation = ""
                occ_patterns = ['Farmer', 'Minister', 'Blacksmith', 'Teacher', 'Merchant',
                               'Carpenter', 'Miller', 'Doctor', 'Lawyer', 'Physician']
                for occ in occ_patterns:
                    if occ.lower() in context.lower():
                        occupation = occ
                        break

                religion = ""
                if 'menn' in context.lower():
                    religion = 'Mennonite'
                elif 'luth' in context.lower():
                    religion = 'Lutheran'
                elif 'meth' in context.lower():
                    religion = 'Methodist'
                elif 'bap' in context.lower():
                    religion = 'Baptist'

                children_text = ""
                children_match = children_pattern.search(context)
                if children_match:
                    children_text = children_match.group(1).strip()

                # Create person
                person_id = self.create_person(
                    name=name,
                    generation=generation,
                    birth=birth,
                    death=death,
                    spouse=spouse,
                    location=location,
                    occupation=occupation,
                    religion=religion,
                    children_text=children_text,
                    section=current_section,
                    line_num=i
                )

                # Track for parent inference
                # Update stack: this person might be parent of next generation
                parent_stack[generation] = person_id

                # Infer parent: look for person in previous generation in same section
                if generation > 1:
                    potential_parent_gen = generation - 1
                    if potential_parent_gen in parent_stack:
                        parent_id = parent_stack[potential_parent_gen]
                        # Only link if parent is in same section
                        if self.persons[parent_id]['section'] == current_section:
                            self.link_parent_child(parent_id, person_id)

        print(f"  Found {len(self.persons)} persons")

        # Second pass: create spouse records and family units
        print("Pass 2: Creating spouse records and families...")
        self._create_spouse_records()

        # Third pass: link children from children lists
        print("Pass 3: Linking children from text lists...")
        self._link_children_from_lists()

        print(f"  Created {len(self.families)} family units")

        return self.persons

    def _create_spouse_records(self):
        """Create spouse person records and family units."""
        spouse_persons = []

        for person_id, person in list(self.persons.items()):
            if person['spouse_name']:
                spouse_name = person['spouse_name']

                # Check if spouse already exists in our records (by name and section)
                existing_spouse = None
                for other_id, other in self.persons.items():
                    if (other['name'] == spouse_name and
                        other['section'] == person['section'] and
                        other_id != person_id):
                        existing_spouse = other_id
                        break

                if existing_spouse:
                    spouse_id = existing_spouse
                else:
                    # Create new spouse record
                    spouse_id = self.create_person(
                        name=spouse_name,
                        generation=person['generation'],
                        section=person['section']
                    )
                    spouse_persons.append(spouse_id)

                # Create family unit
                if person['gender'] == 'M':
                    self.create_family(husband_id=person_id, wife_id=spouse_id)
                elif person['gender'] == 'F':
                    self.create_family(husband_id=spouse_id, wife_id=person_id)
                else:
                    # Unknown gender, guess based on spouse
                    spouse_gender = self.persons[spouse_id]['gender']
                    if spouse_gender == 'M':
                        self.create_family(husband_id=spouse_id, wife_id=person_id)
                    else:
                        self.create_family(husband_id=person_id, wife_id=spouse_id)

    def _link_children_from_lists(self):
        """Link children mentioned in children_text to actual person records."""
        for person_id, person in self.persons.items():
            if not person['children_text']:
                continue

            children_names = self.parse_children_list(person['children_text'])
            if not children_names:
                continue

            child_generation = person['generation'] + 1

            # Find matching children in next generation, same section
            for child_name in children_names:
                # Look for person with matching first name in next generation
                for other_id, other in self.persons.items():
                    if (other['first_name'] == child_name and
                        other['generation'] == child_generation and
                        other['section'] == person['section'] and
                        other_id != person_id):

                        # Check if not already linked
                        if person_id not in other['parent_ids']:
                            self.link_parent_child(person_id, other_id)
                        break

    def add_patriarch(self):
        """Add Bishop Henry Funck as the patriarch (Gen I)."""
        # Create Bishop Henry Funck
        henry_id = self.create_person(
            name="Bishop Henry Funck",
            generation=1,
            birth="c. 1690",
            death="1760",
            location="Indian Creek, Franconia Twp., Montgomery Co., PA",
            occupation="Farmer, Mill Owner",
            religion="Mennonite",
            children_text="John, Henry, Christian, Abraham, Barbara, Anne, Mary, Fronicka, Elizabeth, Esther",
            section="PATRIARCH"
        )
        self.persons[henry_id]['birth_place'] = "Europe (Holland or Palatinate)"
        self.persons[henry_id]['death_place'] = "Franconia Twp., Montgomery Co., PA"

        # Create Anne Meyer (spouse)
        anne_id = self.create_person(
            name="Anne Meyer",
            generation=1,
            death="July 8, 1768",
            section="PATRIARCH"
        )

        # Create family
        self.create_family(husband_id=henry_id, wife_id=anne_id)

        return henry_id, anne_id

    def link_patriarch_to_sections(self, patriarch_id):
        """Link patriarch to section root persons (Gen II children)."""
        patriarch = self.persons.get(patriarch_id)
        if not patriarch:
            return

        # Known Gen II children (sections are named after them)
        gen2_children = ['JOHN FUNK', 'HENRY FUNK', 'CHRISTIAN FUNK', 'ABRAHAM FUNK',
                        'JACOB FUNK', 'BARBARA FUNK', 'FREDERICK FUNK']

        linked = 0
        for person_id, person in self.persons.items():
            if person_id == patriarch_id:
                continue

            # Link by section name (sections are named "DESCENDANTS OF X")
            section_upper = person['section'].upper()
            for child_name in gen2_children:
                if child_name in section_upper:
                    # This section descends from a Gen II child
                    # Find the Gen II person in this section and link to patriarch
                    if person['generation'] == 2 and person_id not in patriarch['child_ids']:
                        self.link_parent_child(patriarch_id, person_id)
                        linked += 1
                        break

            # Also check for direct name match in earliest generation of section
            if (person['generation'] in (2, 4) and  # Gen 2 or first recorded
                not person['parent_ids'] and
                'FUNK' in person['name'].upper()):
                # Try to link orphan Funks to patriarch
                first_name = person['first_name'].upper()
                if first_name in ['JOHN', 'HENRY', 'CHRISTIAN', 'ABRAHAM', 'JACOB', 'BARBARA']:
                    if patriarch_id not in person['parent_ids']:
                        self.link_parent_child(patriarch_id, person_id)
                        linked += 1

        print(f"  Linked {linked} persons to patriarch")

    def export_json(self, output_file):
        """Export to JSON format."""
        # Calculate statistics
        by_gen = defaultdict(int)
        for p in self.persons.values():
            by_gen[p['generation']] += 1

        persons_with_parents = sum(1 for p in self.persons.values() if p['parent_ids'])
        persons_with_children = sum(1 for p in self.persons.values() if p['child_ids'])

        data = {
            "metadata": {
                "title": "Funk Family Tree",
                "source": "A Brief History of Bishop Henry Funck and Other Funk Pioneers (1899)",
                "author": "A.J. Fretz",
                "generated": datetime.now().isoformat(),
                "total_persons": len(self.persons),
                "total_families": len(self.families),
                "persons_with_parents": persons_with_parents,
                "persons_with_children": persons_with_children,
                "generations": dict(sorted(by_gen.items()))
            },
            "persons": self.persons,
            "families": self.families
        }

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        return data

    def export_d3_hierarchy(self, output_file, root_id=None):
        """Export in D3.js hierarchy format (nested structure)."""

        def build_subtree(person_id, visited=None):
            if visited is None:
                visited = set()

            if person_id in visited:
                return None
            visited.add(person_id)

            person = self.persons.get(person_id)
            if not person:
                return None

            node = {
                "id": person_id,
                "name": person['name'],
                "data": {
                    "birth": person['birth_date'],
                    "death": person['death_date'],
                    "gender": person['gender'],
                    "occupation": person['occupation'],
                    "location": person['location'],
                    "generation": person['generation']
                },
                "children": []
            }

            for child_id in person['child_ids']:
                child_node = build_subtree(child_id, visited)
                if child_node:
                    node["children"].append(child_node)

            return node

        # Find root (person with no parents in earliest generation)
        if not root_id:
            candidates = [p for p in self.persons.values() if not p['parent_ids']]
            candidates.sort(key=lambda x: x['generation'])
            root_id = candidates[0]['id'] if candidates else None

        if root_id:
            tree = build_subtree(root_id)
        else:
            tree = {"name": "Unknown Root", "children": []}

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(tree, f, indent=2, ensure_ascii=False)

        return tree

    def print_statistics(self):
        """Print parsing statistics."""
        by_gen = defaultdict(int)
        by_gender = defaultdict(int)
        by_section = defaultdict(int)

        for p in self.persons.values():
            by_gen[p['generation']] += 1
            by_gender[p['gender']] += 1
            by_section[p['section']] += 1

        persons_with_parents = sum(1 for p in self.persons.values() if p['parent_ids'])
        persons_with_children = sum(1 for p in self.persons.values() if p['child_ids'])
        persons_with_spouse = sum(1 for p in self.persons.values() if p['spouse_ids'])

        print("\n" + "=" * 60)
        print("PARSING STATISTICS")
        print("=" * 60)
        print(f"Total persons:          {len(self.persons)}")
        print(f"Total families:         {len(self.families)}")
        print(f"Persons with parents:   {persons_with_parents} ({100*persons_with_parents/len(self.persons):.1f}%)")
        print(f"Persons with children:  {persons_with_children} ({100*persons_with_children/len(self.persons):.1f}%)")
        print(f"Persons with spouse:    {persons_with_spouse} ({100*persons_with_spouse/len(self.persons):.1f}%)")
        print()
        print("By Generation:")
        for gen in sorted(by_gen.keys()):
            print(f"  Gen {gen}: {by_gen[gen]}")
        print()
        print("By Gender:")
        for gender, count in sorted(by_gender.items()):
            label = {'M': 'Male', 'F': 'Female', 'U': 'Unknown'}[gender]
            print(f"  {label}: {count}")
        print()
        print(f"Unique sections/branches: {len(by_section)}")
        print("=" * 60)


def main():
    """Main entry point."""
    import os

    base_path = r"C:\Users\norca\dev\funk-tree"
    ocr_file = os.path.join(base_path, "funk-history-ocr.txt")
    json_output = os.path.join(base_path, "funk_tree.json")
    d3_output = os.path.join(base_path, "funk_tree_d3.json")

    print("=" * 60)
    print("FUNK FAMILY TREE PARSER")
    print("=" * 60)
    print()

    # Create parser
    parser = FamilyTreeParser()

    # Add patriarch first
    print("Adding patriarch (Bishop Henry Funck)...")
    patriarch_id, _ = parser.add_patriarch()

    # Parse OCR file
    print(f"\nParsing OCR file: {ocr_file}")
    parser.parse_ocr_file(ocr_file)

    # Link patriarch to section roots
    print("\nLinking patriarch to descendants...")
    parser.link_patriarch_to_sections(patriarch_id)

    # Print statistics
    parser.print_statistics()

    # Export JSON
    print(f"\nExporting to JSON: {json_output}")
    data = parser.export_json(json_output)

    # Export D3 hierarchy
    print(f"Exporting D3 hierarchy: {d3_output}")
    parser.export_d3_hierarchy(d3_output, patriarch_id)

    print("\nDone!")
    print(f"  - Main JSON: {json_output}")
    print(f"  - D3 Hierarchy: {d3_output}")

    return parser


if __name__ == "__main__":
    main()
