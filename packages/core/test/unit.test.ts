import { describe, expect, it } from 'vitest';
import { parsePortPool, validateConfig } from '../src/config.js';
import { upsertEnv } from '../src/envfile.js';
import { mergeSettings, parseJsonc } from '../src/ide.js';
import { slugify, worktreePathFor } from '../src/paths.js';
import { getPortStrategy } from '../src/ports/index.js';
import { colorForIndex } from '../src/colors.js';

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
  it('gives each worktree index a distinct non-main color', () => {
    expect(colorForIndex(1).name).toBe('Teal');
    expect(colorForIndex(2).name).toBe('Amber');
    expect(colorForIndex(1).hex).not.toBe(colorForIndex(0).hex);
  });
});
