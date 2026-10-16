import { writeFile } from 'node:fs/promises';
import { readTextIfExists } from './util/fs.js';

/**
 * Set `KEY=value` pairs in dotenv text. Existing assignments (including `export KEY=`)
 * are replaced in place; new keys are appended. All other lines are preserved.
 */
export function upsertEnv(text: string, values: Record<string, string>): string {
  const pending = new Map(Object.entries(values));
  const lines = text.length ? text.replace(/\r?\n$/, '').split(/\r?\n/) : [];
  const out = lines.map((line) => {
    const m = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!m || !pending.has(m[2])) return line;
    const value = pending.get(m[2])!;
    pending.delete(m[2]);
    return `${m[1]}${m[2]}=${value}`;
  });
  for (const [k, v] of pending) out.push(`${k}=${v}`);
  return out.join('\n') + '\n';
}

export async function upsertEnvFile(file: string, values: Record<string, string>): Promise<void> {
  await writeFile(file, upsertEnv((await readTextIfExists(file)) ?? '', values));
}
