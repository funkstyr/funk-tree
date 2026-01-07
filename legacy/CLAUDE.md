# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**funk-tree** is a genealogical research project mapping the Funk family lineage from Bishop Heinrich Funck (c. 1690-1760), a German-American Mennonite pioneer. It combines OCR extraction from an 1899 historical book, WikiTree API crawling, and D3.js interactive visualization.

## Commands

### Data Processing
```bash
python parse_tree.py           # Parse OCR text → funk_tree.json, funk_tree_d3.json
python parse_genealogy.py      # Parse OCR text → COMPLETE_FAMILY_TREE.md
python wikitree_crawler.py     # Crawl WikiTree API from Funck-6 patriarch
python convert_wikitree.py     # Transform WikiTree data → visualization format
python search_lineage.py       # Search WikiTree data for specific ancestors
python generate_graphviz.py    # Generate static SVG/PDF tree diagrams
```

### Web Visualization
```bash
cd web && python serve.py      # Start HTTP server on port 8000
```

## Architecture

### Data Pipeline
1. OCR extraction from PDF (`ocr_pdf.py`) → `funk-history-ocr.txt`
2. Parse OCR to linked tree structure (`parse_tree.py`) → `funk_tree.json`
3. Crawl WikiTree API (`wikitree_crawler.py`) → `wikitree_data/progress.json`
4. Convert to visualization format (`convert_wikitree.py`) → web-ready JSON
5. Render with D3.js (`web/js/family_tree.js`)

### Key Components
- **Python scripts (root)**: Data processing, no external dependencies (stdlib only)
- **web/js/family_tree.js**: D3.js visualization with expand/collapse, search, URL sharing, ancestry path highlighting
- **wikitree_data/progress.json**: Crawler state with 15k+ profiles (5.2MB)

### Data Formats
- **Flat JSON** (`funk_tree.json`): Person records with IDs and relationship references
- **D3 Hierarchy** (`funk_tree_d3.json`): Nested structure for tree rendering
- **WikiTree format**: Raw API responses with profile data

## Technical Notes

- WikiTree crawler uses 1-second rate limiting to respect API limits
- Web visualization limits initial tree depth to 3 for DOM performance
- OCR text contains character recognition errors from 1899 scanned pages
- Gender inference uses heuristic name dictionaries
- WikiTree API endpoint: `https://api.wikitree.com/api.php`
- Patriarch WikiTree ID: `Funck-6`
