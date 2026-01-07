# Funk Family Tree

A genealogy project tracing the descendants of Heinrich Funck (c. 1697-1760), one of the earliest Funk immigrants to America and a foundational figure in the Pennsylvania Mennonite community.

## About Heinrich Funck

Heinrich Funck arrived in Philadelphia around 1717 with other German Palatine immigrants seeking religious freedom. By 1719, he settled at Indian Creek in Franconia Township, Montgomery County, Pennsylvania.

He became a Mennonite bishop in the Franconia Mennonite Conference and was the most prolific Mennonite author in Colonial America. His notable works include:

- **Ein Spiegel der Taufe** ([A Mirror of Baptism](https://babel.hathitrust.org/cgi/pt?id=ia.ark:/13960/t6ww7pf3p&seq=2), 1744)
- **Eine Restitution** ([Restitution, or an Explanation of Several Principal Points of the Law](https://babel.hathitrust.org/cgi/pt?id=chi.090327222&seq=7), 1763)
- Supervised the translation of **Martyrs Mirror** from Dutch to German (1745-1748), one of the largest works published in Colonial America

Heinrich and his wife Anne Meyer had ten children, establishing a large American family that continues today. View his full profile on [WikiTree](https://www.wikitree.com/wiki/Funck-6).

## Project Overview

This monorepo contains tools for building and visualizing the Funk family tree:

- **Crawler** - Fetches genealogy data from WikiTree
- **Database** - PostgreSQL schema for persons, relationships, and locations
- **Tree Viz** - Interactive family tree visualization using PixiJS
- **Web App** - Frontend for exploring the family tree
- **API** - Backend services for genealogy data

## Tech Stack

- **Runtime**: Bun
- **Monorepo**: Turborepo
- **Database**: PostgreSQL / PGLite with Drizzle ORM
- **Visualization**: PixiJS
- **Language**: TypeScript

## Getting Started

```bash
# Install dependencies
bun install

# Start the database
bun run db:start

# Run database migrations
bun run db:migrate

# Start development servers
bun run dev
```

## Sources

- [Heinrich Funck - WikiTree](https://www.wikitree.com/wiki/Funck-6)
- [Heinrich Funck - Wikipedia](https://en.wikipedia.org/wiki/Heinrich_Funck)
- [Mennonite Heritage Center - Funk](https://mhep.org/our-immigrant-heritage-funk/)
- [GAMEO - Funck, Heinrich](https://gameo.org/index.php?title=Funck%2C_Heinrich_%28d._1760%29)
