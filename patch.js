const fs = require('fs');
const file = 'utils/map/frame-pool.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(
  `private async fetchEntry(index: number) {`,
  `private async fetchEntry(index: number) { console.error("FETCH_ENTRY", index);`
);
fs.writeFileSync(file, code);
