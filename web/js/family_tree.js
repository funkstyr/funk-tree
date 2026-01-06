/**
 * Funk Family Tree - Interactive D3.js Visualization
 * Features: URL sharing, ancestry path highlighting
 */

class FamilyTreeVisualization {
    constructor() {
        // Configuration
        this.config = {
            nodeRadius: 8,
            nodeRadiusLarge: 12,
            horizontalSpacing: 180,
            verticalSpacing: 60,
            transitionDuration: 500,
            maxInitialDepth: 3
        };

        // State
        this.data = null;
        this.root = null;
        this.svg = null;
        this.g = null;
        this.zoom = null;
        this.treeLayout = null;
        this.selectedNode = null;
        this.maxGeneration = 4;
        this.ancestryPath = []; // Track ancestry path for highlighting

        // DOM elements
        this.container = document.getElementById('tree-container');
        this.svgElement = document.getElementById('tree-svg');
        this.tooltip = document.getElementById('tooltip');
        this.detailPanel = document.getElementById('detail-panel');
        this.loading = document.getElementById('loading');

        // Initialize
        this.init();
    }

    async init() {
        try {
            // Load data
            await this.loadData();

            // Setup SVG and zoom
            this.setupSVG();

            // Setup tree layout
            this.setupTreeLayout();

            // Process and render tree
            this.processData();
            this.render();

            // Setup event listeners
            this.setupEventListeners();

            // Check for URL parameter and select node if present
            this.loadFromURL();

            // Hide loading
            this.loading.classList.add('hidden');

            // Update stats
            this.updateStats();

        } catch (error) {
            console.error('Failed to initialize:', error);
            this.loading.innerHTML = `<p style="color: #ff6b6b;">Error loading data: ${error.message}</p>`;
        }
    }

    async loadData() {
        const response = await fetch('data/funk_tree.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        this.data = await response.json();
        console.log(`Loaded ${Object.keys(this.data.persons).length} persons`);
    }

    setupSVG() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        // Create SVG
        this.svg = d3.select(this.svgElement)
            .attr('width', width)
            .attr('height', height);

        // Create zoom behavior
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 3])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });

        this.svg.call(this.zoom);

        // Create main group
        this.g = this.svg.append('g')
            .attr('transform', `translate(${width / 2}, 50)`);

        // Create groups for links and nodes (ancestry path layer in between)
        this.g.append('g').attr('class', 'links');
        this.g.append('g').attr('class', 'ancestry-links');
        this.g.append('g').attr('class', 'nodes');
    }

    setupTreeLayout() {
        this.treeLayout = d3.tree()
            .nodeSize([this.config.horizontalSpacing, this.config.verticalSpacing])
            .separation((a, b) => {
                return a.parent === b.parent ? 1 : 1.5;
            });
    }

    processData() {
        // Build hierarchy from flat data
        const persons = this.data.persons;

        // Find patriarch (P00001)
        const patriarchId = 'P00001';
        const patriarch = persons[patriarchId];

        if (!patriarch) {
            throw new Error('Patriarch not found in data');
        }

        // Build tree recursively
        const buildNode = (personId, depth = 0) => {
            const person = persons[personId];
            if (!person) return null;

            const node = {
                id: personId,
                name: person.name,
                data: {
                    ...person,
                    depth: depth
                },
                children: []
            };

            // Add children if within max generation
            if (person.child_ids && person.child_ids.length > 0) {
                const validChildren = person.child_ids
                    .filter(childId => {
                        const child = persons[childId];
                        return child && child.generation <= this.maxGeneration;
                    })
                    .map(childId => buildNode(childId, depth + 1))
                    .filter(child => child !== null);

                node.children = validChildren;
            }

            return node;
        };

        const treeData = buildNode(patriarchId);

        // Create D3 hierarchy
        this.root = d3.hierarchy(treeData);

        // Store original children for collapse/expand
        this.root.descendants().forEach(d => {
            d._children = d.children;
            // Initially collapse nodes beyond depth 3
            if (d.depth >= this.config.maxInitialDepth && d.children) {
                d.children = null;
            }
        });

        // Apply tree layout
        this.treeLayout(this.root);
    }

    render() {
        const duration = this.config.transitionDuration;

        // Get nodes and links
        const nodes = this.root.descendants();
        const links = this.root.links();

        // Update links
        const linkSelection = this.g.select('.links')
            .selectAll('.link')
            .data(links, d => d.target.data.id);

        // Enter links
        const linkEnter = linkSelection.enter()
            .append('path')
            .attr('class', 'link')
            .attr('d', d => {
                const o = { x: d.source.x, y: d.source.y };
                return this.linkPath({ source: o, target: o });
            });

        // Update + Enter
        linkSelection.merge(linkEnter)
            .transition()
            .duration(duration)
            .attr('d', d => this.linkPath(d))
            .attr('class', d => this.getLinkClass(d));

        // Exit links
        linkSelection.exit()
            .transition()
            .duration(duration)
            .attr('d', d => {
                const o = { x: d.source.x, y: d.source.y };
                return this.linkPath({ source: o, target: o });
            })
            .remove();

        // Update ancestry path highlighting
        this.renderAncestryPath();

        // Update nodes
        const nodeSelection = this.g.select('.nodes')
            .selectAll('.node')
            .data(nodes, d => d.data.id);

        // Enter nodes
        const nodeEnter = nodeSelection.enter()
            .append('g')
            .attr('class', d => this.getNodeClass(d))
            .attr('transform', d => `translate(${d.x}, ${d.y})`)
            .style('opacity', 0)
            .on('click', (event, d) => this.onNodeClick(event, d))
            .on('mouseover', (event, d) => this.onNodeMouseOver(event, d))
            .on('mouseout', () => this.onNodeMouseOut());

        // Add circle
        nodeEnter.append('circle')
            .attr('r', this.config.nodeRadius);

        // Add text label
        nodeEnter.append('text')
            .attr('dy', -15)
            .attr('text-anchor', 'middle')
            .text(d => this.truncateName(d.data.name));

        // Add collapse indicator
        nodeEnter.append('text')
            .attr('class', 'collapse-indicator')
            .attr('dy', 4)
            .text(d => this.hasHiddenChildren(d) ? '+' : '');

        // Update + Enter
        const nodeUpdate = nodeSelection.merge(nodeEnter);

        nodeUpdate
            .transition()
            .duration(duration)
            .attr('class', d => this.getNodeClass(d))
            .attr('transform', d => `translate(${d.x}, ${d.y})`)
            .style('opacity', 1);

        nodeUpdate.select('.collapse-indicator')
            .text(d => this.hasHiddenChildren(d) ? '+' : '');

        // Exit nodes
        nodeSelection.exit()
            .transition()
            .duration(duration)
            .style('opacity', 0)
            .remove();

        // Update stats
        this.updateStats();
    }

    renderAncestryPath() {
        // Clear existing ancestry path
        this.g.select('.ancestry-links').selectAll('*').remove();

        if (this.ancestryPath.length < 2) return;

        // Create links for ancestry path
        const ancestryLinks = [];
        for (let i = 0; i < this.ancestryPath.length - 1; i++) {
            ancestryLinks.push({
                source: this.ancestryPath[i],
                target: this.ancestryPath[i + 1]
            });
        }

        // Draw highlighted ancestry links
        this.g.select('.ancestry-links')
            .selectAll('.ancestry-link')
            .data(ancestryLinks)
            .enter()
            .append('path')
            .attr('class', 'ancestry-link')
            .attr('d', d => this.linkPath(d))
            .style('fill', 'none')
            .style('stroke', '#ffd700')
            .style('stroke-width', '4px')
            .style('opacity', 0.8)
            .style('filter', 'drop-shadow(0 0 6px #ffd700)');
    }

    getLinkClass(d) {
        let classes = 'link';

        // Check if this link is part of ancestry path
        const sourceInPath = this.ancestryPath.some(n => n.data.id === d.source.data.id);
        const targetInPath = this.ancestryPath.some(n => n.data.id === d.target.data.id);

        if (sourceInPath && targetInPath) {
            classes += ' ancestry-path';
        }

        return classes;
    }

    linkPath(d) {
        // Curved path from parent to child
        return `M${d.source.x},${d.source.y}
                C${d.source.x},${(d.source.y + d.target.y) / 2}
                 ${d.target.x},${(d.source.y + d.target.y) / 2}
                 ${d.target.x},${d.target.y}`;
    }

    getNodeClass(d) {
        const classes = ['node'];

        // Gender/type class
        if (d.data.id === 'P00001') {
            classes.push('node-patriarch');
        } else {
            const gender = d.data.data?.gender || 'U';
            if (gender === 'M') classes.push('node-male');
            else if (gender === 'F') classes.push('node-female');
            else classes.push('node-unknown');
        }

        // Has children indicator
        if (d._children && d._children.length > 0) {
            classes.push('has-children');
        }

        // Collapsed indicator
        if (d._children && !d.children) {
            classes.push('collapsed');
        }

        // Selected
        if (this.selectedNode && this.selectedNode.data.id === d.data.id) {
            classes.push('selected');
        }

        // In ancestry path
        if (this.ancestryPath.some(n => n.data.id === d.data.id)) {
            classes.push('in-ancestry-path');
        }

        return classes.join(' ');
    }

    hasHiddenChildren(d) {
        return d._children && d._children.length > 0 && !d.children;
    }

    truncateName(name) {
        if (!name) return '?';
        if (name.length > 20) {
            return name.substring(0, 18) + '...';
        }
        return name;
    }

    // Build ancestry path from node up to patriarch
    buildAncestryPath(node) {
        this.ancestryPath = [];
        let current = node;
        while (current) {
            this.ancestryPath.unshift(current); // Add to beginning
            current = current.parent;
        }
    }

    // Clear ancestry path
    clearAncestryPath() {
        this.ancestryPath = [];
        this.g.select('.ancestry-links').selectAll('*').remove();
    }

    // Update URL with selected person
    updateURL(personId) {
        const url = new URL(window.location);
        if (personId) {
            url.searchParams.set('person', personId);
        } else {
            url.searchParams.delete('person');
        }
        window.history.pushState({}, '', url);
    }

    // Load selection from URL
    loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        const personId = params.get('person');

        if (personId) {
            // Find the node with this ID
            const targetNode = this.findNodeById(personId);
            if (targetNode) {
                // Expand path to this node
                this.expandPathToNode(targetNode);

                // Recalculate layout
                this.treeLayout(this.root);
                this.render();

                // Select the node
                this.selectNode(targetNode);

                // Center on node after a short delay
                setTimeout(() => {
                    this.centerOnNode(targetNode);
                }, 100);
            }
        }
    }

    // Find a node by person ID
    findNodeById(personId) {
        let found = null;
        this.root.each(d => {
            if (d.data.id === personId) {
                found = d;
            }
        });
        return found;
    }

    // Expand all nodes on path to target
    expandPathToNode(targetNode) {
        let current = targetNode.parent;
        while (current) {
            if (current._children && !current.children) {
                current.children = current._children;
            }
            current = current.parent;
        }
    }

    // Select a node (show details, highlight ancestry)
    selectNode(d) {
        this.selectedNode = d;

        // Build and highlight ancestry path
        this.buildAncestryPath(d);

        // Update URL
        this.updateURL(d.data.id);

        // Update detail panel
        const person = d.data.data;

        document.getElementById('detail-name').textContent = d.data.name;
        document.getElementById('detail-birth').textContent = person?.birth_date || '-';
        document.getElementById('detail-death').textContent = person?.death_date || '-';
        document.getElementById('detail-generation').textContent = person?.generation || '-';
        document.getElementById('detail-location').textContent = person?.location || '-';
        document.getElementById('detail-occupation').textContent = person?.occupation || '-';
        document.getElementById('detail-religion').textContent = person?.religion || '-';

        const childCount = d._children ? d._children.length : 0;
        document.getElementById('detail-children').textContent = childCount > 0 ? `${childCount} children` : 'None';

        // Show ancestry in detail panel
        const ancestryText = this.ancestryPath.map(n => n.data.name).join(' → ');
        const ancestryElement = document.getElementById('detail-ancestry');
        if (ancestryElement) {
            ancestryElement.textContent = ancestryText;
        }

        this.detailPanel.classList.remove('hidden');

        // Re-render to update styling
        this.render();
    }

    onNodeClick(event, d) {
        event.stopPropagation();

        // Toggle children
        if (d._children && d._children.length > 0) {
            if (d.children) {
                d.children = null;
            } else {
                d.children = d._children;
            }

            // Recalculate layout
            this.treeLayout(this.root);
        }

        // Select node (show details, highlight ancestry, update URL)
        this.selectNode(d);

        this.render();
    }

    onNodeMouseOver(event, d) {
        const person = d.data.data;

        let html = `<div class="tooltip-name">${d.data.name}</div>`;

        const birth = person?.birth_date || '';
        const death = person?.death_date || '';
        if (birth || death) {
            html += `<div class="tooltip-dates">${birth || '?'} - ${death || '?'}</div>`;
        }

        const childCount = d._children ? d._children.length : 0;
        if (childCount > 0) {
            html += `<div class="tooltip-hint">Click to ${d.children ? 'collapse' : 'expand'} (${childCount} children)</div>`;
        }

        this.tooltip.innerHTML = html;
        this.tooltip.classList.remove('hidden');
        this.tooltip.style.left = (event.pageX + 15) + 'px';
        this.tooltip.style.top = (event.pageY - 10) + 'px';
    }

    onNodeMouseOut() {
        this.tooltip.classList.add('hidden');
    }

    showDetailPanel(d) {
        this.selectNode(d);
    }

    hideDetailPanel() {
        this.selectedNode = null;
        this.clearAncestryPath();
        this.updateURL(null);
        this.detailPanel.classList.add('hidden');
        this.render();
    }

    setupEventListeners() {
        // Close panel button
        document.getElementById('close-panel').addEventListener('click', () => {
            this.hideDetailPanel();
        });

        // Search
        document.getElementById('search-btn').addEventListener('click', () => {
            this.search();
        });

        document.getElementById('search').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.search();
        });

        document.getElementById('clear-btn').addEventListener('click', () => {
            document.getElementById('search').value = '';
            this.clearHighlight();
            this.hideDetailPanel();
        });

        // Generation filter
        document.getElementById('generation-filter').addEventListener('change', (e) => {
            const value = e.target.value;
            this.maxGeneration = value === 'all' ? 10 : parseInt(value);
            this.processData();
            this.render();
            this.centerTree();
        });

        // Expand/Collapse all
        document.getElementById('expand-all').addEventListener('click', () => {
            this.expandAll();
        });

        document.getElementById('collapse-all').addEventListener('click', () => {
            this.collapseAll();
        });

        // Reset zoom
        document.getElementById('reset-zoom').addEventListener('click', () => {
            this.centerTree();
        });

        // Window resize
        window.addEventListener('resize', () => {
            this.onResize();
        });

        // Handle browser back/forward
        window.addEventListener('popstate', () => {
            this.loadFromURL();
        });

        // Click outside to deselect
        this.svg.on('click', () => {
            this.hideDetailPanel();
        });
    }

    search() {
        const query = document.getElementById('search').value.toLowerCase().trim();
        if (!query) return;

        this.clearHighlight();

        // Find matching nodes
        const matches = [];
        this.root.descendants().forEach(d => {
            if (d.data.name.toLowerCase().includes(query)) {
                matches.push(d);
            }
        });

        if (matches.length === 0) {
            alert('No matches found');
            return;
        }

        // Expand path to all matches
        matches.forEach(d => {
            let current = d.parent;
            while (current) {
                if (current._children && !current.children) {
                    current.children = current._children;
                }
                current = current.parent;
            }
        });

        // Recalculate layout
        this.treeLayout(this.root);
        this.render();

        // Highlight matches
        this.g.selectAll('.node')
            .filter(d => matches.includes(d))
            .classed('highlighted', true);

        // Select and center on first match
        if (matches.length > 0) {
            this.selectNode(matches[0]);
            this.centerOnNode(matches[0]);
        }

        console.log(`Found ${matches.length} matches`);
    }

    clearHighlight() {
        this.g.selectAll('.node').classed('highlighted', false);
    }

    centerOnNode(d) {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        const scale = 1;
        const x = -d.x * scale + width / 2;
        const y = -d.y * scale + height / 3;

        this.svg.transition()
            .duration(750)
            .call(
                this.zoom.transform,
                d3.zoomIdentity.translate(x, y).scale(scale)
            );
    }

    centerTree() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.svg.transition()
            .duration(750)
            .call(
                this.zoom.transform,
                d3.zoomIdentity.translate(width / 2, 50).scale(0.8)
            );
    }

    expandAll() {
        this.root.descendants().forEach(d => {
            if (d._children) {
                d.children = d._children;
            }
        });
        this.treeLayout(this.root);
        this.render();
    }

    collapseAll() {
        this.root.descendants().forEach(d => {
            if (d.depth > 0 && d._children) {
                d.children = null;
            }
        });
        this.treeLayout(this.root);
        this.render();
        this.centerTree();
    }

    updateStats() {
        const totalNodes = this.root.descendants().length;
        const visibleNodes = this.g.selectAll('.node').size();

        document.getElementById('node-count').textContent = `Total: ${Object.keys(this.data.persons).length}`;
        document.getElementById('visible-count').textContent = `Visible: ${visibleNodes}`;
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.svg
            .attr('width', width)
            .attr('height', height);
    }

    // Public method to get shareable URL for current selection
    getShareableURL() {
        return window.location.href;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.familyTree = new FamilyTreeVisualization();
});
