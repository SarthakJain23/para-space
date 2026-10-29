import path from 'node:path';
import { appendFile, mkdir } from 'node:fs/promises';
import { readTextIfExists } from './util/fs.js';

export const LEDGER_DIR = '.para-space';
export const LEDGER_FILE = 'context-history.md';
const HEADER = '# ParaSpace Context History\n\n';

export interface LedgerEntry {
  title: string;
  requirement: string;
  decisions: string[];
  problemSolved: string;
  date?: Date;
}

/**
 * Returns the path to the repo's context ledger: `<mainRoot>/.para-space/context-history.md` (excluded via `info/exclude`, D-051).
 *
 * @param mainRoot - Absolute path to the main repository root.
 * @returns Absolute path to `context-history.md`.
 *
 * @example
 * ledgerPath('/code/app'); // → '/code/app/.para-space/context-history.md'
 */
export function ledgerPath(mainRoot: string): string {
  return path.resolve(mainRoot, LEDGER_DIR, LEDGER_FILE);
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Formats a `LedgerEntry` into a markdown section string.
 *
 * @param e - Ledger entry to format.
 * @returns Markdown block for the ledger entry.
 *
 * @example
 * formatEntry({ title: 'Init', requirement: 'Setup', decisions: ['Used offset'], problemSolved: 'Port safety' });
 */
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

/**
 * Parses markdown text of a context-history ledger into structured entries.
 *
 * @param markdown - Raw markdown text from `.para-space/context-history.md`.
 * @returns Array of parsed entries in chronological order.
 *
 * @example
 * const entries = parseLedger(markdownContent);
 * console.log(entries[0].title);
 */
export function parseLedger(markdown: string): LedgerEntry[] {
  const lines = markdown.split(/\r?\n/);
  const entries: LedgerEntry[] = [];
  let current: LedgerEntry | undefined;
  let section: 'requirement' | 'decisions' | 'problemSolved' | undefined;

  for (const line of lines) {
    const headerMatch = /^##\s+\[(.*?)\]\s+(.*?)\s*$/.exec(line);
    if (headerMatch) {
      if (current) entries.push(current);
      const [, rawDate, title] = headerMatch;
      let date: Date | undefined;
      const parsed = new Date(rawDate.replace(' ', 'T'));
      if (!Number.isNaN(parsed.getTime())) date = parsed;
      current = {
        title,
        requirement: '',
        decisions: [],
        problemSolved: '',
        ...(date ? { date } : {}),
      };
      section = undefined;
      continue;
    }

    if (!current) continue;

    const reqMatch = /^\s*-\s+\*\*Requirement Context:\*\*\s*(.*)$/.exec(line);
    if (reqMatch) {
      current.requirement = reqMatch[1].trim();
      section = 'requirement';
      continue;
    }

    if (/^\s*-\s+\*\*Decision(?:s)? Made:\*\*\s*$/.test(line)) {
      section = 'decisions';
      continue;
    }

    const probMatch = /^\s*-\s+\*\*Problem Solved:\*\*\s*(.*)$/.exec(line);
    if (probMatch) {
      current.problemSolved = probMatch[1].trim();
      section = 'problemSolved';
      continue;
    }

    if (section === 'decisions') {
      const bulletMatch = /^\s*-\s+(.*)$/.exec(line);
      if (bulletMatch) {
        current.decisions.push(bulletMatch[1].trim());
      }
    } else if (section === 'requirement' && line.startsWith('  ')) {
      current.requirement += ' ' + line.trim();
    } else if (section === 'problemSolved' && line.startsWith('  ')) {
      current.problemSolved += ' ' + line.trim();
    }
  }

  if (current) entries.push(current);
  return entries;
}

/**
 * Reads and parses the repo's context ledger (`<mainRoot>/.para-space/context-history.md`).
 * Returns an empty array if the ledger file does not exist.
 *
 * @param mainRoot - Absolute path to the main repository root.
 * @returns Array of parsed ledger entries in chronological order.
 *
 * @example
 * const history = await readLedger('/path/to/repo');
 * // history[0].title → 'Repository configured: port strategy `offset`'
 */
export async function readLedger(mainRoot: string): Promise<LedgerEntry[]> {
  const text = await readTextIfExists(ledgerPath(mainRoot));
  if (!text) return [];
  return parseLedger(text);
}

/**
 * Appends a timestamped entry to the repo's context ledger, creating the file if needed (D-007).
 *
 * @param mainRoot - Absolute path to the main repository root.
 * @param entry - Structured ledger entry to append.
 * @returns Promise that resolves once the entry is appended.
 *
 * @example
 * await appendLedger(mainRoot, {
 *   title: 'Port strategy changed',
 *   requirement: 'Ports clashed with Docker.',
 *   decisions: ['Switched to `scan`.'],
 *   problemSolved: 'Dev servers start reliably.',
 * });
 */
export async function appendLedger(mainRoot: string, entry: LedgerEntry): Promise<void> {
  const file = ledgerPath(mainRoot);
  await mkdir(path.dirname(file), { recursive: true });
  const existing = await readTextIfExists(file);
  const prefix = existing === undefined ? HEADER : existing.endsWith('\n\n') ? '' : '\n';
  await appendFile(file, prefix + formatEntry(entry) + '\n');
}
