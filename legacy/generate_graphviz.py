"""
Generate Graphviz family tree visualizations from funk_tree.json.
Creates SVG/PNG/PDF output files.
"""
import json
import os
import sys
from collections import defaultdict

# Add Graphviz to PATH if needed (Windows installation location)
graphviz_paths = [
    r"C:\Program Files\Graphviz\bin",
    r"C:\Program Files (x86)\Graphviz\bin",
    os.path.expanduser(r"~\AppData\Local\Programs\Graphviz\bin"),
]
for gv_path in graphviz_paths:
    if os.path.exists(gv_path) and gv_path not in os.environ.get('PATH', ''):
        os.environ['PATH'] = gv_path + os.pathsep + os.environ.get('PATH', '')

from graphviz import Digraph


class FamilyTreeVisualizer:
    """Generate Graphviz visualizations of family tree data."""

    # Color schemes
    COLORS = {
        'male': '#6baed6',        # Light blue
        'female': '#fd8d3c',      # Orange
        'unknown': '#969696',     # Gray
        'patriarch': '#2ca02c',   # Green
        'spouse_edge': '#999999', # Gray for spouse connections
        'child_edge': '#333333',  # Dark for parent-child
    }

    def __init__(self, json_file):
        """Load family tree data from JSON."""
        with open(json_file, 'r', encoding='utf-8') as f:
            self.data = json.load(f)
        self.persons = self.data['persons']
        self.families = self.data['families']

    def get_node_color(self, person):
        """Get node color based on gender."""
        if person['id'] == 'P00001':  # Patriarch
            return self.COLORS['patriarch']
        gender = person.get('gender', 'U')
        if gender == 'M':
            return self.COLORS['male']
        elif gender == 'F':
            return self.COLORS['female']
        return self.COLORS['unknown']

    def format_label(self, person, include_dates=True):
        """Format node label with name and optional dates."""
        name = person['name']

        # Escape special characters for Graphviz
        name = name.replace('\\', '\\\\')
        name = name.replace('"', '\\"')
        name = name.replace("'", "\\'")
        name = name.replace('<', '&lt;')
        name = name.replace('>', '&gt;')

        if len(name) > 25:
            # Truncate long names
            name = name[:22] + '...'

        if include_dates:
            birth = person.get('birth_date', '') or ''
            death = person.get('death_date', '') or ''
            # Also escape dates
            birth = birth.replace('"', '\\"').replace("'", "\\'")
            death = death.replace('"', '\\"').replace("'", "\\'")
            if birth or death:
                dates = f"{birth or '?'} - {death or '?'}"
                return f"{name}\\n{dates}"
        return name

    def create_full_tree(self, output_file, max_generations=None, format='svg'):
        """Create visualization of entire tree (may be very large)."""
        dot = Digraph(
            comment='Funk Family Tree',
            format=format,
            engine='dot'
        )

        # Graph attributes for large trees
        dot.attr(
            rankdir='TB',  # Top to bottom
            splines='ortho',  # Orthogonal lines
            nodesep='0.3',
            ranksep='0.5',
            fontname='Arial',
            fontsize='10'
        )

        # Node defaults
        dot.attr('node',
            shape='box',
            style='filled,rounded',
            fontname='Arial',
            fontsize='9',
            margin='0.1,0.05'
        )

        # Edge defaults
        dot.attr('edge',
            arrowsize='0.5',
            color=self.COLORS['child_edge']
        )

        # Add nodes
        node_count = 0
        for person_id, person in self.persons.items():
            if max_generations and person['generation'] > max_generations:
                continue

            color = self.get_node_color(person)
            label = self.format_label(person, include_dates=True)

            dot.node(
                person_id,
                label=label,
                fillcolor=color
            )
            node_count += 1

        # Add edges (parent -> child)
        edge_count = 0
        for person_id, person in self.persons.items():
            if max_generations and person['generation'] > max_generations:
                continue

            for child_id in person.get('child_ids', []):
                if child_id in self.persons:
                    child = self.persons[child_id]
                    if max_generations and child['generation'] > max_generations:
                        continue
                    dot.edge(person_id, child_id)
                    edge_count += 1

        print(f"  Nodes: {node_count}, Edges: {edge_count}")

        # Render
        try:
            dot.render(output_file, cleanup=True)
            print(f"  Output: {output_file}.{format}")
            return True
        except Exception as e:
            print(f"  Error rendering: {e}")
            # Save DOT source for manual rendering
            dot_file = output_file + '.gv'
            dot.save(dot_file)
            print(f"  Saved DOT source: {dot_file}")
            return False

    def create_branch_tree(self, branch_name, output_file, format='svg'):
        """Create visualization for a specific branch/section."""
        dot = Digraph(
            comment=f'Funk Family Tree - {branch_name}',
            format=format,
            engine='dot'
        )

        dot.attr(
            rankdir='TB',
            splines='ortho',
            nodesep='0.4',
            ranksep='0.6',
            fontname='Arial',
            label=f'Descendants of {branch_name}',
            labelloc='t',
            fontsize='14'
        )

        dot.attr('node',
            shape='box',
            style='filled,rounded',
            fontname='Arial',
            fontsize='10',
            margin='0.15,0.08'
        )

        # Filter persons by section
        branch_persons = {
            pid: p for pid, p in self.persons.items()
            if branch_name.upper() in p.get('section', '').upper()
        }

        if not branch_persons:
            print(f"  No persons found for branch: {branch_name}")
            return False

        # Add nodes
        for person_id, person in branch_persons.items():
            color = self.get_node_color(person)
            label = self.format_label(person)
            dot.node(person_id, label=label, fillcolor=color)

        # Add edges
        for person_id, person in branch_persons.items():
            for child_id in person.get('child_ids', []):
                if child_id in branch_persons:
                    dot.edge(person_id, child_id)

        print(f"  Nodes: {len(branch_persons)}")

        try:
            dot.render(output_file, cleanup=True)
            print(f"  Output: {output_file}.{format}")
            return True
        except Exception as e:
            print(f"  Error: {e}")
            dot.save(output_file + '.gv')
            return False

    def create_generation_tree(self, start_gen, end_gen, output_file, format='svg'):
        """Create visualization for specific generation range."""
        dot = Digraph(
            comment=f'Funk Family Tree - Generations {start_gen}-{end_gen}',
            format=format,
            engine='dot'
        )

        dot.attr(
            rankdir='TB',
            splines='ortho',
            nodesep='0.4',
            ranksep='0.8',
            fontname='Arial',
            label=f'Funk Family Tree - Generations {start_gen} to {end_gen}',
            labelloc='t',
            fontsize='16'
        )

        dot.attr('node',
            shape='box',
            style='filled,rounded',
            fontname='Arial',
            fontsize='10',
            margin='0.15,0.08'
        )

        # Filter by generation
        gen_persons = {
            pid: p for pid, p in self.persons.items()
            if start_gen <= p['generation'] <= end_gen
        }

        # Group by generation for ranking
        by_gen = defaultdict(list)
        for pid, p in gen_persons.items():
            by_gen[p['generation']].append(pid)

        # Add nodes with same-rank grouping
        for gen in sorted(by_gen.keys()):
            with dot.subgraph() as s:
                s.attr(rank='same')
                for person_id in by_gen[gen]:
                    person = gen_persons[person_id]
                    color = self.get_node_color(person)
                    label = self.format_label(person)
                    s.node(person_id, label=label, fillcolor=color)

        # Add edges
        edge_count = 0
        for person_id, person in gen_persons.items():
            for child_id in person.get('child_ids', []):
                if child_id in gen_persons:
                    dot.edge(person_id, child_id)
                    edge_count += 1

        print(f"  Nodes: {len(gen_persons)}, Edges: {edge_count}")

        try:
            dot.render(output_file, cleanup=True)
            print(f"  Output: {output_file}.{format}")
            return True
        except Exception as e:
            print(f"  Error: {e}")
            dot.save(output_file + '.gv')
            return False

    def create_patriarch_tree(self, output_file, max_depth=3, format='svg'):
        """Create visualization starting from patriarch with limited depth."""
        dot = Digraph(
            comment='Funk Family Tree - From Patriarch',
            format=format,
            engine='dot'
        )

        dot.attr(
            rankdir='TB',
            splines='ortho',
            nodesep='0.5',
            ranksep='1.0',
            fontname='Arial',
            label='Funk Family Tree\\nDescendants of Bishop Henry Funck',
            labelloc='t',
            fontsize='18'
        )

        dot.attr('node',
            shape='box',
            style='filled,rounded',
            fontname='Arial',
            fontsize='11',
            margin='0.2,0.1'
        )

        # BFS to get nodes within max_depth
        patriarch_id = 'P00001'
        visited = set()
        queue = [(patriarch_id, 0)]
        nodes_to_include = {}

        while queue:
            person_id, depth = queue.pop(0)
            if person_id in visited or depth > max_depth:
                continue
            if person_id not in self.persons:
                continue

            visited.add(person_id)
            person = self.persons[person_id]
            nodes_to_include[person_id] = person

            # Add children to queue
            for child_id in person.get('child_ids', []):
                if child_id not in visited:
                    queue.append((child_id, depth + 1))

        # Group by generation
        by_gen = defaultdict(list)
        for pid, p in nodes_to_include.items():
            by_gen[p['generation']].append(pid)

        # Add nodes
        for gen in sorted(by_gen.keys()):
            with dot.subgraph() as s:
                s.attr(rank='same')
                for person_id in by_gen[gen]:
                    person = nodes_to_include[person_id]
                    color = self.get_node_color(person)

                    # More detailed label for patriarch tree
                    name = person['name']
                    birth = person.get('birth_date', '')
                    death = person.get('death_date', '')

                    if birth or death:
                        label = f"{name}\\n({birth or '?'} - {death or '?'})"
                    else:
                        label = name

                    s.node(person_id, label=label, fillcolor=color)

        # Add edges
        edge_count = 0
        for person_id in nodes_to_include:
            person = nodes_to_include[person_id]
            for child_id in person.get('child_ids', []):
                if child_id in nodes_to_include:
                    dot.edge(person_id, child_id)
                    edge_count += 1

        print(f"  Nodes: {len(nodes_to_include)}, Edges: {edge_count}")

        try:
            dot.render(output_file, cleanup=True)
            print(f"  Output: {output_file}.{format}")
            return True
        except Exception as e:
            print(f"  Error: {e}")
            dot.save(output_file + '.gv')
            return False

    def list_branches(self):
        """List all available branches/sections."""
        sections = defaultdict(int)
        for p in self.persons.values():
            sections[p.get('section', 'Unknown')] += 1

        print("\nAvailable branches:")
        for section, count in sorted(sections.items(), key=lambda x: -x[1]):
            print(f"  {section}: {count} persons")
        return list(sections.keys())


def main():
    """Generate various family tree visualizations."""
    base_path = r"C:\Users\norca\dev\funk-tree"
    json_file = os.path.join(base_path, "funk_tree.json")
    output_dir = os.path.join(base_path, "visualizations")

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    print("=" * 60)
    print("FUNK FAMILY TREE VISUALIZATION")
    print("=" * 60)

    # Load data
    print(f"\nLoading data from: {json_file}")
    viz = FamilyTreeVisualizer(json_file)
    print(f"  Loaded {len(viz.persons)} persons, {len(viz.families)} families")

    # List branches
    viz.list_branches()

    # Generate visualizations
    print("\n" + "-" * 60)
    print("Generating visualizations...")
    print("-" * 60)

    # 1. Patriarch tree (3 levels deep)
    print("\n1. Patriarch Tree (3 generations):")
    viz.create_patriarch_tree(
        os.path.join(output_dir, "funk_tree_patriarch"),
        max_depth=3,
        format='svg'
    )

    # 2. Patriarch tree (4 levels deep) - PDF for printing
    print("\n2. Patriarch Tree (4 generations, PDF):")
    viz.create_patriarch_tree(
        os.path.join(output_dir, "funk_tree_patriarch_4gen"),
        max_depth=4,
        format='pdf'
    )

    # 3. Early generations (1-5)
    print("\n3. Early Generations (1-5):")
    viz.create_generation_tree(
        1, 5,
        os.path.join(output_dir, "funk_tree_gen1-5"),
        format='svg'
    )

    # 4. Individual branch trees
    main_branches = ['JOHN FUNK', 'HENRY FUNK', 'CHRISTIAN FUNK', 'ABRAHAM FUNK']
    for branch in main_branches:
        print(f"\n4. Branch: {branch}")
        safe_name = branch.lower().replace(' ', '_')
        viz.create_branch_tree(
            branch,
            os.path.join(output_dir, f"funk_tree_{safe_name}"),
            format='svg'
        )

    print("\n" + "=" * 60)
    print("VISUALIZATION COMPLETE")
    print("=" * 60)
    print(f"\nOutput directory: {output_dir}")
    print("\nFiles generated:")
    for f in os.listdir(output_dir):
        fpath = os.path.join(output_dir, f)
        size = os.path.getsize(fpath)
        print(f"  {f} ({size:,} bytes)")


if __name__ == "__main__":
    main()
