export default {
  // Lint errors should block commits (no || true)
  "*.{ts,tsx,js,jsx,mjs,cjs}": ["oxlint --fix"],
  // Formatting is non-blocking to avoid disrupting workflow
  "*.{ts,tsx,js,jsx,mjs,cjs,json,md,mdx,css}": (files) => {
    const filtered = files.filter((f) => !f.includes("routeTree.gen"));
    return filtered.length ? [`oxfmt ${filtered.join(" ")} || true`] : [];
  },
};
