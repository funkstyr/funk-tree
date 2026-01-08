# Fast Feedback Loop: TypeScript Native + oxlint Type-Aware Linting

## Goal

Replace the current two-step feedback loop (`bun run check && bun run check-types`) with a single ultra-fast command using TypeScript Native (tsgo) and oxlint's type-aware linting.

**Current feedback loop:**

```bash
bun run check        # oxlint + oxfmt
bun run check-types  # tsc via turbo (slow)
```

**Target feedback loop:**

```bash
bun run check        # oxlint --type-aware --type-check + oxfmt (fast)
bun run test         # vitest
```

## Research Summary

### TypeScript Native (tsgo)

Microsoft is porting TypeScript to Go, achieving **10x performance gains**:

| Metric                      | TypeScript 6 (JS) | TypeScript 7 (Go)   |
| --------------------------- | ----------------- | ------------------- |
| VS Code (1M LOC) type-check | 77s               | 7.5s                |
| Editor startup              | Slow              | Near instant        |
| Memory usage                | High              | Substantially lower |

**Status (December 2025):**

- Type-checking is nearly complete (~20,000 test cases, ~6,000 error-producing)
- VSCode extension available: [TypeScript (Native Preview)](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview)
- CLI available via `@typescript/native-preview` package
- Will release as TypeScript 7.0 when feature-complete

### oxlint Type-Aware Linting

oxlint now supports type-aware linting via `tsgolint`, which is built on typescript-go:

| Metric            | ESLint + typescript-eslint | oxlint --type-aware |
| ----------------- | -------------------------- | ------------------- |
| Type-aware lint   | 1 minute                   | <10 seconds         |
| Speed improvement | Baseline                   | 20-40x faster       |

**Key Features:**

- `--type-aware` flag enables type-aware rules (43 of 59 typescript-eslint rules)
- `--type-check` flag emits TypeScript errors, **replacing `tsc --noEmit`**
- Rules include: `no-floating-promises`, `no-misused-promises`, `await-thenable`

**Current Status (Alpha):**

- Available via `oxlint-tsgolint` package
- Requires TypeScript 7+ compatible tsconfig
- Some large monorepos may encounter memory issues

## Implementation Plan

### Phase 1: TypeScript Native VSCode Extension (Low Risk)

Install and configure the TypeScript Native Preview extension for faster editor feedback.

**Steps:**

1. Install the VSCode extension:
   - Search "TypeScript (Native Preview)" in Extensions
   - Or install from [Marketplace](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview)

2. Enable in VSCode settings (`.vscode/settings.json`):

   ```json
   {
     "typescript.experimental.useTsgo": true
   }
   ```

3. Verify by checking the status bar shows "tsgo" when editing TypeScript files

**Benefits:**

- 10x faster IntelliSense and error checking in editor
- No changes to CI/build process
- Can revert by disabling the setting

### Phase 2: oxlint Type-Aware Linting (Medium Risk)

Upgrade oxlint to use type-aware linting with TypeScript error reporting.

**Steps:**

1. Install oxlint-tsgolint:

   ```bash
   bun add -D oxlint-tsgolint@latest
   ```

2. Upgrade tsconfig for TypeScript 7 compatibility:
   - Remove deprecated options (e.g., `baseUrl` if not needed)
   - Consider using [ts5to6](https://github.com/ArnaudBarre/ts5to6) for migration

3. Update VSCode settings for type-aware linting (`.vscode/settings.json`):

   ```json
   {
     "oxc.typeAware": true
   }
   ```

4. Test type-aware linting:

   ```bash
   oxlint --type-aware --type-check
   ```

5. Update `package.json` scripts:
   ```json
   {
     "scripts": {
       "check": "oxlint --type-aware --type-check && oxfmt --write",
       "check:lint-only": "oxlint && oxfmt --write",
       "check-types": "turbo check-types"  // Keep as fallback
     }
   }
   ```

**Benefits:**

- Single command for linting + type checking
- 20-40x faster than ESLint + typescript-eslint
- Catches more bugs with type-aware rules

### Phase 3: Replace tsc Entirely (Higher Risk)

Once Phase 2 is stable, remove the separate `check-types` step.

**Steps:**

1. Verify `oxlint --type-aware --type-check` catches all errors that `tsc --noEmit` would

2. Update CLAUDE.md:

   ```markdown
   ## Post-Change Verification

   After changes, run: `bun run check && bun run test`
   ```

3. Update CI to use the combined command

4. Remove or deprecate `check-types` script (keep turbo task for build)

**Validation:**

- Run both commands on existing codebase
- Compare error output
- Test on intentionally broken code

## VSCode Configuration Summary

Complete `.vscode/settings.json` for fast feedback:

```json
{
  // TypeScript Native Preview (10x faster IntelliSense)
  "typescript.experimental.useTsgo": true,

  // oxlint type-aware linting
  "oxc.typeAware": true,

  // Auto-fix on save
  "editor.codeActionsOnSave": {
    "source.fixAll.oxc": true
  }
}
```

Recommend extension to team (`.vscode/extensions.json`):

```json
{
  "recommendations": [
    "oxc.oxc-vscode",
    "TypeScriptTeam.native-preview"
  ]
}
```

## Known Limitations

1. **TypeScript 7 Compatibility**: Some tsconfig options deprecated in TS6/removed in TS7 will cause errors
   - `baseUrl` removed (use `paths` with project-relative imports)
   - Use `ts5to6` tool to migrate

2. **Memory Usage**: Large monorepos may hit memory limits with tsgolint (being optimized)

3. **Rule Coverage**: 43/59 typescript-eslint rules currently supported

4. **Alpha Status**: Both typescript-go and tsgolint are in preview/alpha

## Migration Checklist

- [x] Install TypeScript Native Preview VSCode extension (configured in extensions.json)
- [x] Enable `typescript.experimental.useTsgo` in settings
- [x] Install `oxlint-tsgolint` package
- [x] Audit tsconfig for TS7 compatibility (removed `baseUrl` from 4 configs)
- [x] Enable `oxc.typeAware` in VSCode settings
- [x] Test `oxlint --type-aware --type-check` locally
- [x] Update `check` script in package.json
- [x] Update CLAUDE.md post-change verification
- [x] Fix Vitest 4 workspace migration (defineWorkspace -> projects)
- [x] Fix Person type to use camelCase (matching database schema)
- [ ] Verify editor shows "tsgo" in status bar (requires VSCode extension install)
- [x] Update CI pipeline (removed redundant typecheck job)

## Expected Results

| Metric                | Before          | After              |
| --------------------- | --------------- | ------------------ |
| Editor type feedback  | ~2-5s           | <0.5s              |
| `check` command       | ~5s (lint only) | ~8s (lint + types) |
| `check-types` command | ~15-30s         | Eliminated         |
| Total feedback loop   | ~20-35s         | ~8s                |

## Sources

- [Progress on TypeScript 7 - December 2025](https://devblogs.microsoft.com/typescript/progress-on-typescript-7-december-2025/)
- [A 10x Faster TypeScript](https://devblogs.microsoft.com/typescript/typescript-native-port/)
- [TypeScript (Native Preview) Extension](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview)
- [oxlint Type-Aware Linting Alpha](https://oxc.rs/blog/2025-12-08-type-aware-alpha)
- [Type-Aware Linting Documentation](https://oxc.rs/docs/guide/usage/linter/type-aware)
- [Announcing Oxlint Type-Aware Linting Alpha](https://voidzero.dev/posts/announcing-oxlint-type-aware-linting-alpha)
- [oxlint Editor Setup](https://oxc.rs/docs/guide/usage/linter/editors.html)
- [tsgolint GitHub](https://github.com/oxc-project/tsgolint)
