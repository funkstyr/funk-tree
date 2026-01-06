# Family Tree Visualization Plan

## Objective
Create an interactive visual family tree from the Funk Family genealogy data extracted from the 1899 Fretz book (7,198 persons across 8 generations).

---

## Current Data State

| Asset | Description |
|-------|-------------|
| `funk-history-ocr.txt` | Raw OCR text (~60,000 lines) |
| `COMPLETE_FAMILY_TREE.md` | Parsed markdown with 7,198 persons |
| `parse_genealogy.py` | Python parser extracting persons from OCR |

**Current data structure (from parser):**
```python
{
    'generation': int,           # 1-8
    'gen_marker': str,           # 'I', 'II', 'III', etc.
    'name': str,                 # Full name
    'birth': str,                # Birth date
    'death': str,                # Death date
    'spouse': str,               # Spouse name
    'location': str,             # Location
    'occupation': str,           # Occupation
    'religion': str,             # Religious affiliation
    'children': str,             # Children list (text)
    'section': str               # Branch/section header
}
```

**Problem:** Current structure lacks explicit parent-child linking required for tree visualization.

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA PIPELINE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  funk-history-ocr.txt                                           │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐                                            │
│  │ Enhanced Parser │  (Step 1)                                  │
│  │ parse_tree.py   │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │ JSON Tree Data  │────▶│  GEDCOM Export  │  (Optional)        │
│  │ funk_tree.json  │     │  funk_tree.ged  │                    │
│  └────────┬────────┘     └─────────────────┘                    │
│           │                                                     │
│           ├──────────────┬──────────────┬───────────────┐       │
│           ▼              ▼              ▼               ▼       │
│  ┌──────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│  │  Graphviz    │ │   D3.js    │ │   Pyvis    │ │   Gramps   │  │
│  │  (Static)    │ │ (Web/HTML) │ │ (Python)   │ │ (Software) │  │
│  └──────────────┘ └────────────┘ └────────────┘ └────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Enhanced Parser - Create Linked JSON Structure

### Goal
Create a JSON structure with explicit parent-child relationships.

### Proposed JSON Schema

```json
{
  "metadata": {
    "title": "Funk Family Tree",
    "source": "A Brief History of Bishop Henry Funck (1899)",
    "generated": "2026-01-06",
    "total_persons": 7198
  },
  "persons": {
    "P001": {
      "id": "P001",
      "name": "Bishop Henry Funck",
      "first_name": "Henry",
      "last_name": "Funck",
      "birth_date": "c. 1690",
      "birth_place": "Europe (Holland or Palatinate)",
      "death_date": "1760",
      "death_place": "Franconia Twp., Montgomery Co., PA",
      "gender": "M",
      "occupation": "Farmer, Mill Owner",
      "religion": "Mennonite Bishop",
      "generation": 1,
      "parent_ids": [],
      "spouse_ids": ["P002"],
      "child_ids": ["P003", "P004", "P005", "P006", "P007", "P008", "P009", "P010", "P011", "P012"]
    },
    "P002": {
      "id": "P002",
      "name": "Anne Meyer",
      "first_name": "Anne",
      "last_name": "Meyer",
      "death_date": "July 8, 1768",
      "gender": "F",
      "generation": 1,
      "parent_ids": [],
      "spouse_ids": ["P001"],
      "child_ids": ["P003", "P004", "P005", "P006", "P007", "P008", "P009", "P010", "P011", "P012"]
    }
  },
  "families": {
    "F001": {
      "id": "F001",
      "husband_id": "P001",
      "wife_id": "P002",
      "child_ids": ["P003", "P004", "P005", "P006", "P007", "P008", "P009", "P010", "P011", "P012"],
      "marriage_date": null,
      "marriage_place": null
    }
  }
}
```

### Implementation: `parse_tree.py`

```python
"""
Enhanced parser to create linked family tree JSON from OCR text.
"""
import re
import json
from collections import defaultdict

class FamilyTreeParser:
    def __init__(self):
        self.persons = {}
        self.families = {}
        self.person_counter = 0
        self.family_counter = 0

    def generate_person_id(self):
        self.person_counter += 1
        return f"P{self.person_counter:04d}"

    def generate_family_id(self):
        self.family_counter += 1
        return f"F{self.family_counter:04d}"

    def infer_gender(self, name, context):
        """Infer gender from name and context clues."""
        male_names = {'John', 'Henry', 'Jacob', 'Abraham', ...}
        female_names = {'Mary', 'Elizabeth', 'Sarah', ...}

        first_name = name.split()[0] if name else ""
        if first_name in male_names:
            return 'M'
        elif first_name in female_names:
            return 'F'
        # Check for "mrd." (married) pattern for gender hints
        return 'U'  # Unknown

    def parse_children_list(self, children_text):
        """Extract individual children names from children list."""
        # Pattern: "Children: John, Mary, Jacob, Elizabeth."
        names = re.findall(r'([A-Z][a-z]+)', children_text)
        return names

    def link_parent_child(self, parent_id, child_id):
        """Establish bidirectional parent-child link."""
        if parent_id in self.persons:
            self.persons[parent_id]['child_ids'].append(child_id)
        if child_id in self.persons:
            self.persons[child_id]['parent_ids'].append(parent_id)

    def parse_ocr_file(self, filename):
        """Main parsing logic with relationship inference."""
        # ... implementation details ...
        pass

    def export_json(self, output_file):
        """Export to JSON format."""
        data = {
            "metadata": {...},
            "persons": self.persons,
            "families": self.families
        }
        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2)
```

### Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| Inferring parent-child from text order | Use generation markers + section context |
| Matching children names to person entries | Fuzzy matching within generation + branch |
| Handling OCR errors in names | Levenshtein distance for fuzzy matching |
| Spouse relationships across sections | Track marriages explicitly in families dict |
| Missing data (dates, places) | Allow null values, flag for manual review |

---

## Step 2: Visualization Options

### Option A: Graphviz (Static Images)

**Best for:** PDF/print output, simple tree diagrams

**Library:** [graphviz](https://pypi.org/project/graphviz/) or [family-tree-viz](https://pypi.org/project/family-tree-viz/)

```python
from graphviz import Digraph

def create_tree_diagram(json_data, max_generations=4):
    dot = Digraph(comment='Funk Family Tree')
    dot.attr(rankdir='TB')  # Top to bottom

    for person_id, person in json_data['persons'].items():
        if person['generation'] <= max_generations:
            label = f"{person['name']}\n{person.get('birth_date', '?')}-{person.get('death_date', '?')}"
            color = 'lightblue' if person['gender'] == 'M' else 'pink'
            dot.node(person_id, label, style='filled', fillcolor=color)

    for person_id, person in json_data['persons'].items():
        for child_id in person.get('child_ids', []):
            dot.edge(person_id, child_id)

    dot.render('funk_family_tree', format='svg')
```

**Output:** SVG, PNG, or PDF file

**Pros:**
- Simple to implement
- Good for printing
- Handles large trees with clustering

**Cons:**
- Not interactive
- Large trees become unreadable

---

### Option B: D3.js Interactive Web Visualization (Recommended)

**Best for:** Web-based interactive exploration

**Libraries:**
- [D3.js d3-hierarchy](https://d3js.org/d3-hierarchy)
- [family-chart](https://github.com/donatso/family-chart) - D3-based family tree library
- [js_family_tree](https://github.com/BenPortner/js_family_tree) - Interactive family tree with d3-dag

**Architecture:**

```
funk_tree.json  ──▶  index.html + family_tree.js  ──▶  Browser
                           │
                           └── D3.js / family-chart library
```

**Implementation Structure:**

```
funk-tree/
├── web/
│   ├── index.html          # Main HTML page
│   ├── css/
│   │   └── tree.css        # Styling
│   ├── js/
│   │   ├── family_tree.js  # D3 visualization code
│   │   └── d3.min.js       # D3 library
│   └── data/
│       └── funk_tree.json  # Generated JSON data
└── generate_web.py         # Script to generate web files
```

**Sample D3.js Code:**

```javascript
// family_tree.js
const width = 1200;
const height = 800;

d3.json("data/funk_tree.json").then(data => {
    // Convert flat JSON to hierarchy
    const root = d3.stratify()
        .id(d => d.id)
        .parentId(d => d.parent_ids[0])  // Primary parent
        (Object.values(data.persons));

    // Create tree layout
    const treeLayout = d3.tree().size([width - 100, height - 100]);
    treeLayout(root);

    // Draw nodes and links
    const svg = d3.select("#tree-container")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // Links
    svg.selectAll(".link")
        .data(root.links())
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("d", d3.linkVertical()
            .x(d => d.x)
            .y(d => d.y));

    // Nodes
    const nodes = svg.selectAll(".node")
        .data(root.descendants())
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .on("click", expandCollapse);

    nodes.append("circle")
        .attr("r", 8)
        .attr("fill", d => d.data.gender === 'M' ? '#6baed6' : '#fd8d3c');

    nodes.append("text")
        .attr("dy", -12)
        .text(d => d.data.name);
});

function expandCollapse(event, d) {
    // Toggle children visibility on click
    if (d.children) {
        d._children = d.children;
        d.children = null;
    } else {
        d.children = d._children;
        d._children = null;
    }
    update(d);
}
```

**Features:**
- Click to expand/collapse branches
- Zoom and pan navigation
- Hover for person details
- Search functionality
- Filter by generation/branch

**Pros:**
- Highly interactive
- Works in any browser
- Can handle large datasets with lazy loading
- Professional appearance

**Cons:**
- Requires JavaScript knowledge
- More complex to implement

---

### Option C: Pyvis (Python → Interactive HTML)

**Best for:** Quick Python-to-HTML pipeline

**Library:** [pyvis](https://pypi.org/project/pyvis/)

```python
from pyvis.network import Network

def create_interactive_tree(json_data):
    net = Network(height="100vh", width="100%", directed=True)
    net.barnes_hut()  # Physics layout

    for person_id, person in json_data['persons'].items():
        color = '#6baed6' if person['gender'] == 'M' else '#fd8d3c'
        title = f"{person['name']}<br>Born: {person.get('birth_date', '?')}<br>Died: {person.get('death_date', '?')}"
        net.add_node(person_id, label=person['name'], color=color, title=title)

    for person_id, person in json_data['persons'].items():
        for child_id in person.get('child_ids', []):
            net.add_edge(person_id, child_id)

    net.show("funk_family_tree.html")
```

**Pros:**
- Pure Python, no JavaScript needed
- Generates standalone HTML file
- Physics-based layout

**Cons:**
- Less customizable than D3.js
- Network layout not ideal for strict tree hierarchy

---

### Option D: GEDCOM Export (For Genealogy Software)

**Best for:** Compatibility with Gramps, Ancestry, FamilySearch

**Library:** [python-gedcom](https://pypi.org/project/python-gedcom/)

```python
def export_gedcom(json_data, output_file):
    """Export to GEDCOM 5.5 format."""
    lines = [
        "0 HEAD",
        "1 SOUR FunkTreeParser",
        "1 GEDC",
        "2 VERS 5.5",
        "1 CHAR UTF-8",
    ]

    for person_id, person in json_data['persons'].items():
        lines.append(f"0 @{person_id}@ INDI")
        lines.append(f"1 NAME {person['name']}")
        if person.get('birth_date'):
            lines.append("1 BIRT")
            lines.append(f"2 DATE {person['birth_date']}")
        if person.get('death_date'):
            lines.append("1 DEAT")
            lines.append(f"2 DATE {person['death_date']}")
        if person.get('gender'):
            lines.append(f"1 SEX {person['gender']}")

    for family_id, family in json_data['families'].items():
        lines.append(f"0 @{family_id}@ FAM")
        if family.get('husband_id'):
            lines.append(f"1 HUSB @{family['husband_id']}@")
        if family.get('wife_id'):
            lines.append(f"1 WIFE @{family['wife_id']}@")
        for child_id in family.get('child_ids', []):
            lines.append(f"1 CHIL @{child_id}@")

    lines.append("0 TRLR")

    with open(output_file, 'w') as f:
        f.write('\n'.join(lines))
```

**Use with:**
- [Gramps](https://www.gramps-project.org/) - Free genealogy software
- [Ancestry.com](https://ancestry.com) - Upload GEDCOM
- [FamilySearch](https://familysearch.org) - Import GEDCOM

---

## Implementation Phases

### Phase 1: Data Transformation (Essential)
**Time estimate:** Core work

**Files to create:**
- `parse_tree.py` - Enhanced parser with relationship linking
- `funk_tree.json` - Output JSON with full structure

**Tasks:**
1. Enhance parser to extract parent-child relationships from section context
2. Implement gender inference from names
3. Create family units for married couples
4. Validate data integrity (no orphan nodes)
5. Generate JSON output

---

### Phase 2: Static Visualization (Quick Win)
**Time estimate:** Quick implementation

**Files to create:**
- `generate_graphviz.py` - Graphviz tree generator
- `funk_tree.svg` / `funk_tree.pdf` - Output files

**Tasks:**
1. Install graphviz (`pip install graphviz`)
2. Create tree diagram script
3. Generate output for first 4 generations (manageable size)
4. Add clustering by branch for readability

---

### Phase 3: Interactive Web Visualization (Full Feature)
**Time estimate:** Moderate implementation

**Files to create:**
```
web/
├── index.html
├── css/tree.css
├── js/family_tree.js
└── data/funk_tree.json
```

**Tasks:**
1. Set up D3.js project structure
2. Implement tree layout with expand/collapse
3. Add person detail popup on hover/click
4. Implement search functionality
5. Add generation filtering
6. Style with family-appropriate colors
7. Test with full dataset

---

### Phase 4: GEDCOM Export (Optional)
**Time estimate:** Quick implementation

**Files to create:**
- `export_gedcom.py` - GEDCOM exporter
- `funk_tree.ged` - GEDCOM output file

**Tasks:**
1. Implement GEDCOM 5.5 writer
2. Map JSON structure to GEDCOM tags
3. Validate with GEDCOM validator
4. Test import in Gramps

---

## Recommended Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Parser | Python 3.10+ | Data extraction & transformation |
| JSON Schema | Custom | Intermediate data format |
| Static Viz | Graphviz | PDF/SVG output |
| Interactive Viz | D3.js + family-chart | Web visualization |
| Alternative Viz | Pyvis | Quick Python→HTML |
| Genealogy Export | python-gedcom | GEDCOM compatibility |

---

## Dependencies to Install

```bash
# Core
pip install graphviz
pip install pyvis
pip install python-gedcom

# Optional for enhanced parsing
pip install fuzzywuzzy  # Fuzzy name matching
pip install python-Levenshtein  # Speed up fuzzywuzzy
```

---

## Files to Create

| File | Description |
|------|-------------|
| `parse_tree.py` | Enhanced parser creating linked JSON |
| `funk_tree.json` | Output data with relationships |
| `generate_graphviz.py` | Static tree image generator |
| `generate_web.py` | D3.js web visualization generator |
| `export_gedcom.py` | GEDCOM format exporter |
| `web/index.html` | Interactive web page |
| `web/js/family_tree.js` | D3.js visualization code |
| `web/css/tree.css` | Styling |

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| OCR errors breaking parent-child links | Fuzzy matching + manual review flag |
| 7,198 nodes too large for browser | Lazy loading, generation filtering |
| Ambiguous relationships in source | Mark uncertain links, allow manual correction |
| Graphviz layout too cluttered | Use subgraph clustering by branch |

---

## Success Criteria

1. JSON file with >90% of persons having valid parent links
2. Graphviz output readable for first 4 generations
3. D3.js visualization loads in <3 seconds
4. GEDCOM imports successfully into Gramps
5. Search finds any person by name within 1 second

---

## Sources & References

### Libraries
- [family-tree-viz (PyPI)](https://pypi.org/project/family-tree-viz/)
- [familytreemaker (GitHub)](https://github.com/adrienverge/familytreemaker)
- [python-gedcom (PyPI)](https://pypi.org/project/python-gedcom/)
- [pyvis](https://pypi.org/project/pyvis/)
- [graphviz Python](https://pypi.org/project/graphviz/)

### D3.js Resources
- [D3 Hierarchy](https://d3js.org/d3-hierarchy)
- [D3 Tree Layout](https://d3js.org/d3-hierarchy/tree)
- [family-chart (D3-based)](https://github.com/donatso/family-chart)
- [js_family_tree](https://github.com/BenPortner/js_family_tree)

### Tutorials
- [Building a Family Tree with Python and Graphviz](https://medium.com/@ahsenparwez/building-a-family-tree-with-python-and-graphviz-e4afb8367316)
- [Building Genealogy Tree GUI with Python](https://medium.com/@yurywallet/building-genealogy-tree-gui-with-python-is-it-easy-404dbd376302)
- [Genealogy tree visualization with D3.js](https://chezsoi.org/lucas/blog/genealogy-tree-visualization-with-d3-js.html)

### GEDCOM Resources
- [gedcom-tree (GitHub)](https://github.com/Teemeam/gedcom-tree)
- [awesome-gedcom](https://github.com/todrobbins/awesome-gedcom)

---

*Plan created: January 2026*
*For: Funk Family Genealogy Visualization Project*
