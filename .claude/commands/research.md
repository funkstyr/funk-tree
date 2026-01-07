---
description: Research and plan a feature or solution
argument-hint: <feature or problem to research>
allowed-tools: Glob, Grep, Read, Task, WebSearch, WebFetch
---

# Research & Planning Command

You are researching and planning an implementation for: **$ARGUMENTS**

## Context

This is a TypeScript monorepo for the Funk family genealogy project:

- **Apps**: `apps/web` (TanStack Start), `apps/server` (Hono + oRPC), `apps/crawler` (WikiTree)
- **Packages**: `@funk-tree/db` (Drizzle), `@funk-tree/api` (oRPC), `@funk-tree/tree-viz` (PixiJS)
- **Data Sources**: WikiTree API for genealogy data
- **Focus**: Heinrich Funck (c. 1697-1760) descendants

## Research Process

### 1. Understand the Request

- Parse the feature/problem description
- Identify key requirements and constraints
- Note any ambiguities to clarify

### 2. Audit What Already Exists

**CRITICAL**: Before designing new features, thoroughly audit existing code:

- Search for similar implementations in the codebase
- Check if infrastructure already exists
- Look for partial implementations or TODOs
- Review relevant package structures

### 3. Identify MVP vs Full Solution

**Always think in iterations:**

| Phase           | Focus                    | Characteristics                  |
| --------------- | ------------------------ | -------------------------------- |
| **MVP**         | Minimum valuable feature | Reuses existing code, ships fast |
| **Enhancement** | Next atomic feature      | Builds on MVP, one capability    |
| **Full**        | Complete vision          | All features, edge cases         |

Ask: **What's the smallest change that delivers value?**

### 4. Architecture Analysis

- Determine which apps/packages are affected
- Identify dependencies between components
- Consider data flow (client → oRPC → database)

### 5. Create Implementation Plan

For **each phase** (MVP, then enhancements):

- Break down into discrete tasks
- Order by dependencies
- Identify what already exists vs needs to be built

## Output Format

Write the plan to a markdown file in `plans/` using this structure:

```markdown
# Feature Plan: {Name}

**Date**: YYYY-MM-DD
**Status**: Planning

---

## Executive Summary

Brief description of the full solution

## Current State Audit

| Component | Status | Location |
|-----------|--------|----------|
| ... | COMPLETE / PARTIAL / NOT STARTED | file path |

## MVP (Phase 1)

### What It Delivers
- Bullet points of user-facing value

### What It Reuses
- Existing code being leveraged

### Implementation Steps
1. Numbered steps with file paths

### What's NOT in MVP
- Explicitly list deferred features

## Phase 2: {Enhancement Name}

(Repeat structure for each subsequent phase)
```

## Anti-Patterns to Avoid

- **Over-engineering**: Start simple, iterate
- **Greenfield syndrome**: Don't create new packages when existing ones suffice
- **Ignoring existing code**: Always audit before designing

## Begin Research

1. First, **audit the codebase** for existing implementations
2. Identify what already works and what's missing
3. Define the **MVP** that ships value quickly
4. Create a plan file with clear phases
