export default {
  "*.{ts,tsx,js,jsx,mjs,cjs}": ["oxlint --fix || true"],
  "*.{ts,tsx,js,jsx,mjs,cjs,json,md,mdx,css}": (files) => {
    const filtered = files.filter((f) => !f.includes("routeTree.gen"));
    return filtered.length ? [`oxfmt ${filtered.join(" ")} || true`] : [];
  },
};
