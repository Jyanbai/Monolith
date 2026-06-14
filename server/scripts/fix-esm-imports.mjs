#!/usr/bin/env node
// Post-build: TS bundler resolution emits import "./foo" without .js ext,
// Node ESM requires explicit extensions. Patch all dist/*.js to add .js.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || 'dist';

function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      walk(p);
    } else if (p.endsWith('.js')) {
      let s = fs.readFileSync(p, 'utf8');
      const before = s;
      // import ... from "./foo"  | export ... from "./foo"
      s = s.replace(/(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g,
        (m, a, rel, b) => /\.(js|json|mjs|cjs)$/.test(rel) ? m : a + rel + '.js' + b);
      // import "./foo"
      s = s.replace(/(\bimport\s+['"])(\.\.?\/[^'"]+?)(['"])/g,
        (m, a, rel, b) => /\.(js|json|mjs|cjs)$/.test(rel) ? m : a + rel + '.js' + b);
      // dynamic import("./foo")
      s = s.replace(/(\bimport\(\s*['"])(\.\.?\/[^'"]+?)(['"])/g,
        (m, a, rel, b) => /\.(js|json|mjs|cjs)$/.test(rel) ? m : a + rel + '.js' + b);
      if (s !== before) {
        fs.writeFileSync(p, s);
      }
    }
  }
}

walk(ROOT);
console.log(`Patched all relative imports under ${ROOT}/ with .js extension`);
