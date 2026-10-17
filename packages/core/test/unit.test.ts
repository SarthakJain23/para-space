import { describe, expect, it } from 'vitest';
import { parsePortPool, validateConfig } from '../src/config.js';
import { upsertEnv } from '../src/envfile.js';
import { mergeSettings, parseJsonc } from '../src/ide.js';
import { slugify, worktreePathFor } from '../src/paths.js';
import { getPortStrategy } from '../src/ports/index.js';
import { PALETTE, colorForIndex, peacockSettings } from '../src/colors.js';
import { formatEntry, parseLedger, type LedgerEntry } from '../src/ledger.js';

describe('paths', () => {
  it('slugifies branch names', () => {
    expect(slugify('feat/TK-101')).toBe('feat-TK-101');
    expect(slugify('fix//weird name!')).toBe('fix-weird-name');
  });
  it('puts worktrees in a sibling directory', () => {
    expect(worktreePathFor('/code/myapp', 'feat/TK-101')).toBe('/code/myapp-feat-TK-101');
  });
});

describe('ports', () => {
  it('offset = base + index, skipping assigned', async () => {
    const s = getPortStrategy('offset');
    expect(await s.allocatePort({ worktreeIndex: 2, basePort: 3000, assignedPorts: [3000] })).toBe(3002);
    expect(await s.allocatePort({ worktreeIndex: 1, basePort: 3000, assignedPorts: [3000, 3001] })).toBe(3002);
  });
  it('pool takes the first unassigned port and errors when exhausted', async () => {
    const s = getPortStrategy('pool');
    expect(await s.allocatePort({ worktreeIndex: 1, basePort: 3000, assignedPorts: [4001], pool: [4001, 4002] })).toBe(
      4002,
    );
    await expect(
      s.allocatePort({ worktreeIndex: 1, basePort: 3000, assignedPorts: [4001], pool: [4001] }),
    ).rejects.toThrow(/exhausted/);
  });
  it('scan returns a free port above base, excluding assigned', async () => {
    const port = await getPortStrategy('scan').allocatePort({
      worktreeIndex: 1,
      basePort: 41000,
      assignedPorts: [41001],
    });
    expect(port).toBeGreaterThan(41001);
  });
  it('passthrough injects nothing', async () => {
    expect(
      await getPortStrategy('passthrough').allocatePort({ worktreeIndex: 1, basePort: 3000, assignedPorts: [] }),
    ).toBeUndefined();
  });
});

describe('config', () => {
  it('fills defaults and validates', () => {
    expect(validateConfig({ portStrategy: 'offset' })).toEqual({
      portStrategy: 'offset',
      basePort: 3000,
      envKeys: ['PORT'],
    });
    expect(() => validateConfig({ portStrategy: 'nope' })).toThrow();
    expect(() => validateConfig({ portStrategy: 'pool' })).toThrow(/portPool/);
    expect(() => validateConfig({ portStrategy: 'offset', envKeys: ['bad-key'] })).toThrow();
  });
  it('parses port pool ranges', () => {
    expect(parsePortPool('3001-3003')).toEqual([3001, 3002, 3003]);
    expect(() => parsePortPool('3003-3001')).toThrow();
  });
});

describe('envfile', () => {
  it('replaces existing keys in place and appends new ones', () => {
    const out = upsertEnv('# c\nPORT=3000\nexport VITE_PORT=1\nSECRET=x\n', {
      PORT: '3001',
      VITE_PORT: '3001',
      NEW: '1',
    });
    expect(out).toBe('# c\nPORT=3001\nexport VITE_PORT=3001\nSECRET=x\nNEW=1\n');
  });
  it('handles empty input', () => {
    expect(upsertEnv('', { PORT: '3001' })).toBe('PORT=3001\n');
  });
});

describe('ide settings', () => {
  it('parses JSONC with comments and trailing commas', () => {
    expect(parseJsonc('{\n // c\n "a": "http://x", /* b */ "b": [1,],\n}')).toEqual({ a: 'http://x', b: [1] });
  });
  it('merges color customizations without dropping existing keys', () => {
    const merged = mergeSettings(
      { 'editor.tabSize': 2, 'workbench.colorCustomizations': { 'editor.background': '#000' } },
      { 'workbench.colorCustomizations': { 'titleBar.activeBackground': '#008080' } },
    );
    expect(merged).toEqual({
      'editor.tabSize': 2,
      'workbench.colorCustomizations': { 'editor.background': '#000', 'titleBar.activeBackground': '#008080' },
    });
  });
  it('gives each worktree index a distinct non-main color, cycling after 7', () => {
    expect(colorForIndex(1).name).toBe('Lagoon');
    expect(colorForIndex(2).name).toBe('Coral');
    expect(colorForIndex(8)).toBe(colorForIndex(1));
    const worktreeHexes = Array.from({ length: 7 }, (_, i) => colorForIndex(i + 1).hex);
    expect(new Set(worktreeHexes).size).toBe(7);
    expect(worktreeHexes).not.toContain(colorForIndex(0).hex);
  });

  it('every palette color keeps white text readable (WCAG AA ≥ 4.5:1)', () => {
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const c of PALETTE) {
      for (const shade of [c.hex, c.dark]) expect(1.05 / (lum(shade) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('colors title and status bars, leaves the activity bar to the theme, no translucent fills', () => {
    const s = peacockSettings(colorForIndex(1));
    expect(s['titleBar.activeBackground']).toBe('#137d87');
    expect(s['titleBar.inactiveBackground']).toBe('#006871');
    expect(s['statusBar.background']).toBe('#137d87');
    expect(s['activityBar.background']).toBeUndefined();
    for (const [key, value] of Object.entries(s)) {
      if (key.endsWith('Background')) expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('ledger', () => {
  it('formats and parses context ledger entries symmetrically', () => {
    const entry: LedgerEntry = {
      title: 'Repository configured: port strategy `scan`',
      requirement: 'First ParaSpace worktree in this repository.',
      decisions: [
        'Port strategy `scan`, base port `3000`, env keys `PORT` saved to `.para-space.json`.',
        'Added `.para-space/` to `.gitignore`.',
      ],
      problemSolved: 'Future worktrees reuse this choice without prompting.',
      date: new Date('2026-10-17T12:00:00'),
    };
    const formatted = formatEntry(entry);
    const parsed = parseLedger(formatted);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('Repository configured: port strategy `scan`');
    expect(parsed[0].requirement).toBe('First ParaSpace worktree in this repository.');
    expect(parsed[0].decisions).toEqual([
      'Port strategy `scan`, base port `3000`, env keys `PORT` saved to `.para-space.json`.',
      'Added `.para-space/` to `.gitignore`.',
    ]);
    expect(parsed[0].problemSolved).toBe('Future worktrees reuse this choice without prompting.');
    expect(parsed[0].date?.toISOString()).toBe(new Date('2026-10-17T12:00:00').toISOString());
  });

  it('parses multiple entries preserving order', () => {
    const md = [
      '# ParaSpace Context History',
      '',
      '## [2026-10-16 10:00] First Entry',
      '- **Requirement Context:** Req 1',
      '- **Decision Made:**',
      '  - Dec 1a',
      '  - Dec 1b',
      '- **Problem Solved:** Solved 1',
      '',
      '## [2026-10-16 11:30] Second Entry',
      '- **Requirement Context:** Req 2',
      '- **Decision Made:**',
      '  - Dec 2a',
      '- **Problem Solved:** Solved 2',
    ].join('\n');
    const parsed = parseLedger(md);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].title).toBe('First Entry');
    expect(parsed[1].title).toBe('Second Entry');
  });

  it('returns empty array for empty markdown or non-entry text', () => {
    expect(parseLedger('')).toEqual([]);
    expect(parseLedger('# Just a header\nSome intro text')).toEqual([]);
  });
});
