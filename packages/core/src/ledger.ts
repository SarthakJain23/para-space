import path from 'node:path';
import { appendFile, mkdir } from 'node:fs/promises';
import { readTextIfExists } from './util/fs.js';

export const LEDGER_DIR = '.paralleltree';
export const LEDGER_FILE = 'context-history.md';
const HEADER = '# ParallelTree Context History\n\n';

export interface LedgerEntry {
  title: string;
  requirement: string;
  decisions: string[];
  problemSolved: string;
  date?: Date;
}

export function ledgerPath(mainRoot: string): string {
  return path.resolve(mainRoot, LEDGER_DIR, LEDGER_FILE);
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatEntry(e: LedgerEntry): string {
  return [
    `## [${stamp(e.date ?? new Date())}] ${e.title}`,
    `- **Requirement Context:** ${e.requirement}`,
    `- **Decision Made:**`,
    ...e.decisions.map((d) => `  - ${d}`),
    `- **Problem Solved:** ${e.problemSolved}`,
    '',
  ].join('\n');
}

/** Append an entry to `.paralleltree/context-history.md` (D-007). */
export async function appendLedger(mainRoot: string, entry: LedgerEntry): Promise<void> {
  const file = ledgerPath(mainRoot);
  await mkdir(path.dirname(file), { recursive: true });
  const existing = await readTextIfExists(file);
  const prefix = existing === undefined ? HEADER : existing.endsWith('\n\n') ? '' : '\n';
  await appendFile(file, prefix + formatEntry(entry) + '\n');
}
