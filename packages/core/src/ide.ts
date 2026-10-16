import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { readTextIfExists } from './util/fs.js';

/** Strip // and /* *\/ comments and trailing commas so JSONC settings files parse. */
export function parseJsonc(text: string): Record<string, unknown> {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      out += ch;
      if (ch === '\\') out += text[++i] ?? '';
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
      out += ch;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += ch;
    }
  }
  out = out.replace(/,(\s*[}\]])/g, '$1');
  return out.trim() ? (JSON.parse(out) as Record<string, unknown>) : {};
}

/**
 * Merge settings into a VS Code settings object. `workbench.colorCustomizations`
 * is merged key-by-key so a developer's other customizations survive.
 */
export function mergeSettings(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    const prev = merged[k];
    if (k === 'workbench.colorCustomizations' && prev && typeof prev === 'object' && v && typeof v === 'object') {
      merged[k] = { ...(prev as object), ...(v as object) };
    } else {
      merged[k] = v;
    }
  }
  return merged;
}

/** Write merged settings to `<worktree>/.vscode/settings.json`. Callers must have user consent (D-006). */
export async function writeWorkspaceSettings(worktreeRoot: string, settings: Record<string, unknown>): Promise<string> {
  const file = path.resolve(worktreeRoot, '.vscode', 'settings.json');
  const existing = parseJsonc((await readTextIfExists(file)) ?? '');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(mergeSettings(existing, settings), null, 2) + '\n');
  return file;
}
