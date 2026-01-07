import { defineConfig, type UserConfig } from "vitest/config";

/**
 * Base vitest configuration shared across all packages.
 */
export const baseConfig: UserConfig["test"] = {
  globals: true,
  include: ["src/**/*.test.{ts,tsx}"],
  passWithNoTests: true,
  coverage: {
    provider: "v8",
    reporter: ["text", "json", "json-summary", "html"],
    reportsDirectory: "coverage",
    exclude: ["src/**/*.stories.{ts,tsx}", "src/test/**", "src/**/index.ts"],
  },
};

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
      ...baseConfig,
      name: options.name,
      environment: "node",
      include: [...(baseConfig.include ?? []), ...(options.testInclude ?? [])],
      coverage: {
        ...baseConfig.coverage,
        include: ["src/**/*.ts", ...(options.coverageInclude ?? [])],
        exclude: [...(baseConfig.coverage?.exclude ?? []), ...(options.coverageExclude ?? [])],
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
      ...baseConfig,
      name: options.name,
      environment: "jsdom",
      include: [...(baseConfig.include ?? []), ...(options.testInclude ?? [])],
      coverage: {
        ...baseConfig.coverage,
        include: ["src/**/*.{ts,tsx}", ...(options.coverageInclude ?? [])],
        exclude: [...(baseConfig.coverage?.exclude ?? []), ...(options.coverageExclude ?? [])],
      },
    },
  });
}

export { defineConfig };
