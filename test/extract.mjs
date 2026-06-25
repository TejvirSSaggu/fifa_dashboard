import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const m = html.match(/\/\/ <bracket-pure>([\s\S]*?)\/\/ <\/bracket-pure>/);
if (!m) throw new Error('bracket-pure block not found in index.html');
// `typeof X` is safe for not-yet-declared functions, so this returns each function
// once its task adds it — no stubs needed in index.html.
const NAMES = ['parseSlot', 'numberRounds', 'resolveSlot', 'projectedRound'];
export const pure = new Function(
  m[1] + '\nreturn { ' + NAMES.map(n => `${n}: typeof ${n}==='function' ? ${n} : undefined`).join(', ') + ' };'
)();
