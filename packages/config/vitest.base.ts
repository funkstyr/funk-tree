import { defineConfig } from "vitest/config";

/**
 * Base test includes shared across all packages.
 */
const baseInclude = ["src/**/*.test.{ts,tsx}"];

/**
 * Base coverage excludes shared across all packages.
 */
const baseCoverageExclude = ["src/**/*.stories.{ts,tsx}", "src/test/**", "src/**/index.ts"];

export interface CreateConfigOptions {
  /** Package name for vitest's test.name */
  name: string;
  /** Additional coverage include patterns */
  coverageInclude?: string[];
  /** Additional coverage exclude patterns */
  coverageExclude?: string[];
  /** Additional test include patterns */
  testInclude?: string[];
}

/**
 * Create a vitest config for server/Node.js packages.
 */
export function createServerConfig(options: CreateConfigOptions) {
  return defineConfig({
    test: {
      globals: true,
      passWithNoTests: true,
      name: options.name,
      environment: "node",
      include: [...baseInclude, ...(options.testInclude ?? [])],
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "json-summary", "html"],
        reportsDirectory: "coverage",
        include: ["src/**/*.ts", ...(options.coverageInclude ?? [])],
        exclude: [...baseCoverageExclude, ...(options.coverageExclude ?? [])],
      },
    },
  });
}

/**
 * Create a vitest config for UI/React packages.
 */
export function createUIConfig(options: CreateConfigOptions) {
  return defineConfig({
    test: {
      globals: true,
      passWithNoTests: true,
      name: options.name,
      environment: "jsdom",
      include: [...baseInclude, ...(options.testInclude ?? [])],
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "json-summary", "html"],
        reportsDirectory: "coverage",
        include: ["src/**/*.{ts,tsx}", ...(options.coverageInclude ?? [])],
        exclude: [...baseCoverageExclude, ...(options.coverageExclude ?? [])],
      },
    },
  });
}

export { defineConfig };
