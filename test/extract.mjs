import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const m = html.match(/\/\/ <bracket-pure>([\s\S]*?)\/\/ <\/bracket-pure>/);
if (!m) throw new Error('bracket-pure block not found in index.html');
export const pure = new Function(
  m[1] + '\nreturn { parseSlot, numberRounds, resolveSlot, projectedRound };'
)();
