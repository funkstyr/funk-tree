"""
Corrected parser to create linked family tree JSON from OCR text.
Version 2: Fixes generation numbering and eliminates duplicates.

Generation scheme:
- Gen 0: Bishop Henry Funck and Anne Meyer (patriarch couple)
- Gen 1: Their 10 children (John, Henry, Christian, Abraham, Esther, Barbara, Anne, Mary, Fronicka, Elizabeth)
- Gen 2+: Subsequent descendants

The OCR uses Roman numerals:
- II. = Gen 1 (children of patriarch)
- III. = Gen 2
- IV. = Gen 3
- etc.
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
    'Ulysses', 'Perry', 'Ervin', 'Irwin', 'Alvin', 'Melvin', 'Marvin', 'Conrad',
    'Gottlieb', 'Heinrich', 'Johann', 'Hans', 'Wilhelm', 'Friedrich', 'Ulrich',
    'Clayton', 'Norman', 'Victor', 'Sylvester', 'Stover', 'Tilghman', 'Enos',
    'Nelson', 'Jerome', 'Mahlon', 'Aldus', 'Hiram', 'Emanuel', 'Israel', 'Josiah'
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
    'Maude', 'Gertrude', 'Hilda', 'Rosie', 'Rosetta', 'Violet', 'Daisy',
    'Lucy', 'Lucinda', 'Malinda', 'Matilda', 'Tabitha', 'Abigail', 'Levina',
    'Raetta', 'Violetta', 'Lauretta', 'Elsie', 'Eve', 'Lizste', 'Tezie'
}

# Words that should NEVER be parsed as person names
INVALID_NAME_PATTERNS = [
    r'^After\s+I\s+am',
    r'^For\s+as\s+much',
    r'^Whereas',
    r'^In\s+the\s+Name',
    r'^And\s+I\s+do',
    r'^And\s+as\s+',
    r'^And\s+it\s+is',
    r'^And\s+none',
    r'^It\s+is\s+',
    r'^That\s+',
    r'^This\s+',
    r'^These\s+',
    r'^Which\s+',
    r'^Where\s+',
    r'^With\s+',
    r'^At\s+the\s+',
    r'^To\s+the\s+',
    r'^I\s+do\s+',
    r'^I\s+say\s+',
    r'^But\s+if\s+',
    r'^children$',
    r'^issue$',
    r'^descendants$',
    r'^\d+',
    r'^PAGE\s+\d+',
    r'^See\s+',
    r'^None\s+',
    r'^Then\s+',
    r'^moved\s+to',
    r'^Descendants\s+',
]

INVALID_NAME_WORDS = {
    'children', 'issue', 'and', 'the', 'with', 'born', 'died', 'twin', 'twins',
    'after', 'whereas', 'therefore', 'shall', 'hereby', 'thereto', 'thereof',
    'aforesaid', 'herein', 'hereof', 'hereunto', 'whereof', 'wherein',
    'page', 'see', 'index', 'references', 'none', 'unknown', 'descendants'
}


class FamilyTreeParserV2:
    """Corrected parser that creates linked family tree structure."""

    def __init__(self):
        self.persons = {}
        self.families = {}
        self.person_counter = 0
        self.family_counter = 0
        self.name_index = defaultdict(list)  # For deduplication

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

        first_name = name.split()[0] if name else ""

        # Remove titles
        if first_name in ('Rev', 'Rev.', 'Bishop', 'Deacon', 'Elder', 'Dr', 'Dr.', 'Eld', 'Eld.'):
            parts = name.split()
            first_name = parts[1] if len(parts) > 1 else ""

        # Remove trailing punctuation
        first_name = first_name.rstrip('.,;:')

        if first_name in MALE_NAMES:
            return 'M'
        elif first_name in FEMALE_NAMES:
            return 'F'

        # Check endings
        if first_name.endswith(('a', 'ie', 'ey', 'ina', 'ella', 'etta')) and first_name not in ('Henry', 'Harry', 'Perry', 'Joshua'):
            return 'F'

        return 'U'

    def is_valid_name(self, name):
        """Check if a string is a valid person name."""
        if not name or len(name) < 2:
            return False

        # Check against invalid patterns
        for pattern in INVALID_NAME_PATTERNS:
            if re.match(pattern, name, re.IGNORECASE):
                return False

        # Check if all words are invalid
        words = name.lower().split()
        if all(w in INVALID_NAME_WORDS for w in words):
            return False

        # Must have at least one capitalized word
        if not any(w[0].isupper() for w in name.split() if w):
            return False

        # Should not be too long (sentences)
        if len(name) > 50:
            return False

        # Should not contain obvious sentence patterns
        if ' is ' in name.lower() or ' was ' in name.lower() or ' are ' in name.lower():
            return False
        if ' shall ' in name.lower() or ' will ' in name.lower():
            return False

        # Should not be occupation/profession words only
        occupation_words = {'farmer', 'baker', 'miller', 'carpenter', 'teacher', 'minister',
                          'doctor', 'lawyer', 'merchant', 'blacksmith', 'mason', 'shoemaker'}
        if name.lower().rstrip('.') in occupation_words:
            return False

        # Should not contain certain patterns that indicate non-names
        invalid_substrings = [
            'Children:', 'P.O.', 'P. O.', 'Presby.', 'Menn.', 'Luth.', 'Bap.',
            'Ch. of', 'Brothers.', 'moved to', 'Descendants', 'dec\'d', 'dec\'d.',
            'bn.', 'died', 'mrd.', 'Employed', 'Res.', 'Single'
        ]
        for substr in invalid_substrings:
            if substr.lower() in name.lower():
                return False

        # Name should have at least one letter
        if not any(c.isalpha() for c in name):
            return False

        # First word should look like a name (not just initials or single letters)
        first_word = name.split()[0].rstrip('.,')
        if len(first_word) == 1 and first_word not in ('A', 'J', 'E', 'O'):  # Some initials are OK
            return False

        # Should not end with certain words
        last_word = name.split()[-1].lower().rstrip('.,')
        if last_word in {'co', 'pa', 'ohio', 'ind', 'twp', 'township'}:
            return False

        return True

    def extract_first_name(self, full_name):
        """Extract first name from full name."""
        if not full_name:
            return ""
        parts = full_name.split()
        if parts[0] in ('Rev', 'Rev.', 'Bishop', 'Deacon', 'Elder', 'Dr', 'Dr.', 'Eld', 'Eld.', '*'):
            return parts[1] if len(parts) > 1 else parts[0]
        return parts[0].rstrip('.,;:')

    def extract_last_name(self, full_name):
        """Extract last name from full name."""
        if not full_name:
            return ""
        parts = full_name.split()
        return parts[-1].rstrip('.,;:') if parts else ""

    def clean_name(self, name):
        """Clean up a name string."""
        if not name:
            return ""
        # Remove leading asterisks and spaces
        name = re.sub(r'^\*\s*', '', name)
        # Remove trailing punctuation except periods in abbreviations
        name = re.sub(r'[,;:]+$', '', name)
        # Normalize whitespace
        name = re.sub(r'\s+', ' ', name).strip()
        # Fix common OCR errors
        name = name.replace('Jobn', 'John')
        name = name.replace('Fuok', 'Funck')
        name = name.replace('Fuuck', 'Funck')
        return name

    def find_existing_person(self, name, generation, section):
        """Find if a person already exists to avoid duplicates."""
        clean = self.clean_name(name).lower()
        first = self.extract_first_name(name).lower()
        last = self.extract_last_name(name).lower()

        for pid, person in self.persons.items():
            p_clean = self.clean_name(person['name']).lower()
            p_first = person['first_name'].lower()
            p_last = person['last_name'].lower()

            # Same name and generation
            if p_clean == clean and person['generation'] == generation:
                return pid

            # Same first+last name, same or adjacent generation, same section
            if (p_first == first and p_last == last and
                abs(person['generation'] - generation) <= 1 and
                person['section'] == section):
                return pid

        return None

    def create_person(self, name, generation, birth="", death="", spouse="",
                      location="", occupation="", religion="", children_text="",
                      section="", line_num=0, check_duplicate=True):
        """Create a person record with unique ID."""
        name = self.clean_name(name)

        if not self.is_valid_name(name):
            return None

        # Check for duplicates
        if check_duplicate:
            existing = self.find_existing_person(name, generation, section)
            if existing:
                # Update existing record with new info if available
                person = self.persons[existing]
                if birth and not person['birth_date']:
                    person['birth_date'] = birth
                if death and not person['death_date']:
                    person['death_date'] = death
                if location and not person['location']:
                    person['location'] = location
                if occupation and not person['occupation']:
                    person['occupation'] = occupation
                return existing

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
            'birth_year': self._extract_year(birth),
            'death_year': self._extract_year(death),
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
            'source_line': line_num
        }

        self.persons[person_id] = person
        self.name_index[name.lower()].append(person_id)
        return person_id

    def _extract_year(self, date_str):
        """Extract year from date string."""
        if not date_str:
            return None
        match = re.search(r'\b(1[5-9]\d{2})\b', str(date_str))
        return int(match.group(1)) if match else None

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

        if husband_id and husband_id in self.persons:
            self.persons[husband_id]['family_ids'].append(family_id)
            if wife_id:
                if wife_id not in self.persons[husband_id]['spouse_ids']:
                    self.persons[husband_id]['spouse_ids'].append(wife_id)

        if wife_id and wife_id in self.persons:
            self.persons[wife_id]['family_ids'].append(family_id)
            if husband_id:
                if husband_id not in self.persons[wife_id]['spouse_ids']:
                    self.persons[wife_id]['spouse_ids'].append(husband_id)

        return family_id

    def link_parent_child(self, parent_id, child_id):
        """Establish bidirectional parent-child link."""
        if parent_id in self.persons and child_id in self.persons:
            if child_id not in self.persons[parent_id]['child_ids']:
                self.persons[parent_id]['child_ids'].append(child_id)
            if parent_id not in self.persons[child_id]['parent_ids']:
                self.persons[child_id]['parent_ids'].append(parent_id)

    def add_patriarch_family(self):
        """Add Bishop Henry Funck (Gen 0) and his 10 children (Gen 1)."""
        # Gen 0: Bishop Henry Funck
        henry_id = self.create_person(
            name="Bishop Henry Funck",
            generation=0,
            birth="c. 1690",
            death="1760",
            location="Indian Creek, Franconia Twp., Montgomery Co., PA",
            occupation="Farmer, Mill Owner, Bishop",
            religion="Mennonite",
            section="PATRIARCH",
            check_duplicate=False
        )
        self.persons[henry_id]['birth_place'] = "Europe (Holland or Palatinate)"
        self.persons[henry_id]['death_place'] = "Franconia Twp., Montgomery Co., PA"

        # Gen 0: Anne Meyer (wife)
        anne_id = self.create_person(
            name="Anne Meyer",
            generation=0,
            birth="c. 1702",
            death="July 8, 1758",
            section="PATRIARCH",
            check_duplicate=False
        )
        self.persons[anne_id]['death_place'] = "Franconia Twp., Montgomery Co., PA"

        # Create family
        family_id = self.create_family(husband_id=henry_id, wife_id=anne_id)

        # Gen 1: The 10 children (from page 20 of OCR)
        # "His children were, John, Henry, Christian, Abraham, Esther, Barbara, Anne, Mary, Fronicka, Elizabeth."
        children_data = [
            {"name": "John Funk", "gender": "M", "birth": "c. 1727", "death": "1807",
             "occupation": "Blacksmith, Farmer", "location": "Hilltown Twp., Bucks Co., PA"},
            {"name": "Henry Funk", "gender": "M", "birth": "c. 1729", "death": "c. 1793",
             "location": "Hilltown Twp., Bucks Co., PA"},
            {"name": "Christian Funk", "gender": "M", "birth": "c. 1731", "death": "1811",
             "occupation": "Farmer, Minister", "religion": "Mennonite"},
            {"name": "Abraham Funk", "gender": "M", "birth": "c. 1733",
             "occupation": "Miller", "location": "Indian Creek, PA"},
            {"name": "Esther Funk", "gender": "F", "notes": "disabled, never married"},
            {"name": "Barbara Funk", "gender": "F"},
            {"name": "Anne Funk", "gender": "F"},
            {"name": "Mary Funk", "gender": "F"},
            {"name": "Fronicka Funk", "gender": "F"},
            {"name": "Elizabeth Funk", "gender": "F"},
        ]

        child_ids = []
        for child in children_data:
            cid = self.create_person(
                name=child["name"],
                generation=1,
                birth=child.get("birth", ""),
                death=child.get("death", ""),
                occupation=child.get("occupation", ""),
                location=child.get("location", ""),
                religion=child.get("religion", "Mennonite"),
                section="PATRIARCH",
                check_duplicate=False
            )
            if cid:
                self.persons[cid]['gender'] = child["gender"]
                self.link_parent_child(henry_id, cid)
                self.link_parent_child(anne_id, cid)
                child_ids.append(cid)

        # Update family with children
        self.families[family_id]['child_ids'] = child_ids

        return henry_id, anne_id, child_ids

    def parse_ocr_file(self, filename):
        """Main parsing logic with corrected generation numbering."""

        with open(filename, 'r', encoding='utf-8') as f:
            text = f.read()

        lines = text.split('\n')

        # Roman numeral to generation mapping (adjusted for Gen 0 = patriarch)
        # OCR produces many garbled versions of Roman numerals
        # Book uses: I=Gen1(patriarch), II=Gen2(children), III=Gen3(grandchildren)
        # We use: Gen0=patriarch, Gen1=children, Gen2=grandchildren
        # So book's II -> our Gen 1, book's III -> our Gen 2, etc.
        gen_map = {
            # Standard Roman numerals (book's numbering - 1 = our numbering)
            'II': 1, 'III': 2, 'IV': 3, 'V': 4, 'VI': 5, 'VII': 6, 'VIII': 7,
            # Lowercase
            'i': 1, 'ii': 1, 'iii': 2, 'iv': 3, 'v': 4, 'vi': 5, 'vii': 6, 'viii': 7,
            # OCR errors for III (Gen 2)
            'mM': 2, 'UI': 2, 'Ul': 2, 'Il': 2, 'lI': 2, 'IH': 2, 'IIl': 2,
            'lll': 2, 'Ill': 2, 'TIl': 2, 'm': 2,
            # OCR errors for IV (Gen 3)
            'W': 3, 'WW': 3, 'lV': 3, 'iV': 3, '1V': 3,
            # OCR errors for V (Gen 4)
            'Vv': 4, 'vV': 4, 'VV': 4,
            # OCR errors for VI (Gen 5)
            'Vi': 5, 'Vl': 5, 'vI': 5, 'WI': 5, 'WL': 5, 'Wl': 5,
            # OCR errors for VII (Gen 6)
            'VIL': 6, 'Vil': 6, 'VIl': 6, 'VII': 6, 'vii': 6, 'Vii': 6,
            # OCR errors for VIII (Gen 7)
            'VIIl': 7, 'Vlll': 7
        }

        # Pattern to match generation entries - very broad to catch OCR errors
        gen_pattern = re.compile(
            r'^([IiVvWwUulLmMHTt]{1,4})\.\s+([A-Z].+)',
            re.IGNORECASE
        )

        # Section header pattern
        section_pattern = re.compile(r'DESCENDANTS\s+OF\s+(.+?)(?:,\s*SON|\s*$)', re.IGNORECASE)

        # Data extraction patterns
        birth_pattern = re.compile(
            r'bn\.?\s*(?:in\s+[\w\s,]+,?\s*)?([A-Za-z]+\.?\s*\d{1,2},?\s*\d{4}|\d{4}|[A-Za-z]+,?\s*\d{4}|c\.\s*\d{4})',
            re.IGNORECASE
        )
        death_pattern = re.compile(
            r'(?:died|dec\'?d)\.?\s*([A-Za-z]+\.?\s*\d{1,2},?\s*\d{4}|\d{4})',
            re.IGNORECASE
        )
        marriage_pattern = re.compile(r'[Mm]rd\.?\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)', re.IGNORECASE)
        children_pattern = re.compile(r'Children:?\s*([A-Za-z,\s]+?)(?:\.|$)', re.IGNORECASE)
        location_pattern = re.compile(r'P\.?\s*[Oo]\.?,?\s*([A-Za-z\s,]+?(?:Pa|Ohio|Ind|N\.?\s*J|Va|Md)\.?)', re.IGNORECASE)

        # Track context
        current_section = "Unknown"
        parent_stack = {}  # generation -> most recent person ID at that generation
        in_will_section = False  # Track if we're in the will/testament section

        print("Parsing OCR file...")

        for i, line in enumerate(lines):
            line = line.strip()

            # Skip empty lines
            if not line:
                continue

            # Detect will section (pages 13-20 contain the will)
            if 'The Last Will and Testament' in line:
                in_will_section = True
                continue
            if 'DESCENDANTS OF' in line.upper():
                in_will_section = False

            # Skip will content
            if in_will_section:
                continue

            # Check for section headers
            section_match = section_pattern.search(line)
            if section_match:
                current_section = section_match.group(1).strip()
                parent_stack = {}  # Reset for new section
                continue

            # Check for generation entries
            gen_match = gen_pattern.match(line)
            if gen_match:
                gen_marker = gen_match.group(1)
                rest_of_line = gen_match.group(2)

                # Get generation number - try exact match first, then uppercase
                generation = gen_map.get(gen_marker)
                if generation is None:
                    generation = gen_map.get(gen_marker.upper())
                if generation is None:
                    generation = gen_map.get(gen_marker.lower())
                if generation is None:
                    # Skip if we can't determine generation
                    continue

                # Build context from following lines
                context = rest_of_line
                for j in range(1, 6):
                    if i + j < len(lines):
                        next_line = lines[i + j].strip()
                        # Stop if we hit another generation entry or section header
                        if gen_pattern.match(next_line) or 'DESCENDANTS OF' in next_line.upper():
                            break
                        if next_line and not next_line.startswith('PAGE'):
                            context += " " + next_line

                # Extract name - stop at common delimiters
                name_match = re.match(
                    r'^([A-Za-z\*\s\.]+?)(?:,\s*bn\.|\s+bn\.|\s+mrd\.|\s+died|\s+dec|\s*\(|,\s*\d)',
                    rest_of_line,
                    re.IGNORECASE
                )
                if name_match:
                    name = name_match.group(1).strip()
                else:
                    # Fallback: take first comma-separated part
                    name = rest_of_line.split(',')[0].strip()
                    name = re.sub(r'\s+bn\..*', '', name, flags=re.IGNORECASE)
                    name = re.sub(r'\s+mrd\..*', '', name, flags=re.IGNORECASE)

                name = self.clean_name(name)

                # Validate name
                if not self.is_valid_name(name):
                    continue

                # Extract data
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

                location = ""
                loc_match = location_pattern.search(context)
                if loc_match:
                    location = loc_match.group(1).strip()[:50]

                occupation = ""
                for occ in ['Farmer', 'Minister', 'Blacksmith', 'Teacher', 'Merchant',
                           'Carpenter', 'Miller', 'Doctor', 'Lawyer', 'Physician']:
                    if occ.lower() in context.lower():
                        occupation = occ
                        break

                religion = ""
                if 'menn' in context.lower():
                    religion = 'Mennonite'
                elif 'luth' in context.lower():
                    religion = 'Lutheran'
                elif 'ref' in context.lower():
                    religion = 'Reformed'
                elif 'bap' in context.lower():
                    religion = 'Baptist'

                children_text = ""
                children_match = children_pattern.search(context)
                if children_match:
                    children_text = children_match.group(1).strip()

                # Adjust generation based on section context
                # Gen 1 should ONLY be children of patriarch (from PATRIARCH section or section roots)
                # If we're in a descendant section and see gen=1, it's likely the section root
                # Otherwise it should be at least Gen 2
                if current_section != "PATRIARCH" and current_section != "Unknown":
                    if generation == 1:
                        # This is likely the section root person - keep as Gen 1
                        # But check if this is actually a patriarch's child
                        name_upper = name.upper()
                        known_gen1 = ['JOHN FUNK', 'HENRY FUNK', 'CHRISTIAN FUNK', 'ABRAHAM FUNK',
                                     'ESTHER FUNK', 'BARBARA FUNK', 'ANNE FUNK', 'MARY FUNK',
                                     'FRONICKA FUNK', 'ELIZABETH FUNK']
                        is_known_gen1 = any(k in name_upper for k in known_gen1)
                        if not is_known_gen1:
                            # Not a known Gen 1 child, bump to Gen 2
                            generation = 2

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
                    line_num=i,
                    check_duplicate=True
                )

                if not person_id:
                    continue

                # Update parent stack
                parent_stack[generation] = person_id

                # Link to parent in previous generation
                if generation > 1:
                    parent_gen = generation - 1
                    if parent_gen in parent_stack:
                        parent_id = parent_stack[parent_gen]
                        if self.persons[parent_id]['section'] == current_section:
                            self.link_parent_child(parent_id, person_id)

        print(f"  Found {len(self.persons)} persons from OCR")

    def link_gen1_to_sections(self, gen1_ids):
        """Link Gen 1 children to their descendant sections."""
        # Map section names to Gen 1 children
        section_to_child = {}
        for pid in gen1_ids:
            person = self.persons[pid]
            first_name = person['first_name'].upper()
            section_to_child[first_name] = pid

        linked = 0
        for person_id, person in self.persons.items():
            if person['generation'] != 1:  # Only process Gen 2 in sections
                continue
            if person_id in gen1_ids:  # Skip Gen 1 themselves
                continue

            # Try to link based on section name
            section = person['section'].upper()
            for child_name, child_id in section_to_child.items():
                if child_name + ' FUNK' in section:
                    # This person is in a section descended from this Gen 1 child
                    # Find the first person in this section at Gen 2 and link to Gen 1
                    if not person['parent_ids']:
                        self.link_parent_child(child_id, person_id)
                        linked += 1
                    break

        print(f"  Linked {linked} Gen 2 persons to Gen 1 ancestors")

    def create_spouse_records(self):
        """Create spouse records and family units."""
        print("Creating spouse records and families...")

        for person_id, person in list(self.persons.items()):
            spouse_name = person.get('spouse_name', '')
            if not spouse_name or not self.is_valid_name(spouse_name):
                continue

            # Check if spouse already exists
            existing_spouse = self.find_existing_person(spouse_name, person['generation'], person['section'])

            if existing_spouse:
                spouse_id = existing_spouse
            else:
                # Create new spouse
                spouse_id = self.create_person(
                    name=spouse_name,
                    generation=person['generation'],
                    section=person['section'],
                    check_duplicate=True
                )

            if spouse_id:
                if person['gender'] == 'M':
                    self.create_family(husband_id=person_id, wife_id=spouse_id)
                elif person['gender'] == 'F':
                    self.create_family(husband_id=spouse_id, wife_id=person_id)
                else:
                    spouse_gender = self.persons[spouse_id]['gender'] if spouse_id in self.persons else 'U'
                    if spouse_gender == 'M':
                        self.create_family(husband_id=spouse_id, wife_id=person_id)
                    else:
                        self.create_family(husband_id=person_id, wife_id=spouse_id)

        print(f"  Created {len(self.families)} family units")

    def export_json(self, output_file):
        """Export to JSON format."""
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
        """Export in D3.js hierarchy format."""

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

        if not root_id:
            # Find Gen 0 person (patriarch)
            for pid, person in self.persons.items():
                if person['generation'] == 0 and person['gender'] == 'M':
                    root_id = pid
                    break

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

        for p in self.persons.values():
            by_gen[p['generation']] += 1
            by_gender[p['gender']] += 1

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
        print("=" * 60)


def main():
    """Main entry point."""
    import os

    base_path = r"C:\Users\norca\dev\funk-tree"
    ocr_file = os.path.join(base_path, "funk-history-ocr.txt")
    json_output = os.path.join(base_path, "funk_tree.json")
    d3_output = os.path.join(base_path, "funk_tree_d3.json")

    print("=" * 60)
    print("FUNK FAMILY TREE PARSER V2")
    print("(Corrected generation numbering)")
    print("=" * 60)
    print()

    # Create parser
    parser = FamilyTreeParserV2()

    # Add patriarch family (Gen 0 and Gen 1)
    print("Creating patriarch family...")
    patriarch_id, anne_id, gen1_ids = parser.add_patriarch_family()
    print(f"  Created patriarch couple and {len(gen1_ids)} Gen 1 children")

    # Parse OCR file
    print(f"\nParsing OCR file: {ocr_file}")
    parser.parse_ocr_file(ocr_file)

    # Link Gen 1 children to their sections
    print("\nLinking Gen 1 to descendant sections...")
    parser.link_gen1_to_sections(gen1_ids)

    # Create spouse records
    print()
    parser.create_spouse_records()

    # Print statistics
    parser.print_statistics()

    # Export JSON
    print(f"\nExporting to JSON: {json_output}")
    parser.export_json(json_output)

    # Export D3 hierarchy
    print(f"Exporting D3 hierarchy: {d3_output}")
    parser.export_d3_hierarchy(d3_output, patriarch_id)

    print("\nDone!")
    print(f"  - Main JSON: {json_output}")
    print(f"  - D3 Hierarchy: {d3_output}")

    return parser


if __name__ == "__main__":
    main()
