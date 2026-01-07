---
description: Deeply understand code, patterns, or architecture
argument-hint: <file path, component, or concept>
allowed-tools: Glob, Grep, Read, Task
---

# Code Understanding Command

You are analyzing and explaining: **$ARGUMENTS**

## Context

This is a TypeScript monorepo with:

- Hono + oRPC backend
- TanStack Start frontend
- Drizzle ORM for database
- PixiJS for tree visualization
- WikiTree API integration for genealogy data

## Analysis Process

1. **Locate the Code**
   - Find the relevant files
   - Identify the module boundaries
   - Map the directory structure

2. **Trace Dependencies**
   - What does this code depend on?
   - What depends on this code?
   - How does data flow through it?

3. **Understand Patterns**
   - Identify design patterns used
   - Document API patterns (oRPC procedures)
   - Note React patterns (hooks, composition)

4. **Document Behavior**
   - What does this code do?
   - What are the inputs/outputs?
   - What side effects exist?

## Output Format

### Overview

High-level description of what this code does and why it exists.

### Architecture

```
Visual representation of the code structure and data flow
```

### Key Components

Explain each major piece:

- **Name**: What it does and how it works

### Patterns Used

- List and explain design patterns
- Note any oRPC patterns
- Highlight any React patterns

### Dependencies

- **Upstream**: What this code needs
- **Downstream**: What uses this code

### Examples

Show how this code is used in practice.

### Related Code

- Links to similar patterns in the codebase
- Related files to explore

## Begin Analysis

Read the specified code and provide a comprehensive explanation of how it works.
