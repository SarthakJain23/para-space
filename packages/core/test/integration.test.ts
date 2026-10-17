import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readlink, realpath, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorktree, isolateWorktree, listWorktrees, removeWorktree } from '../src/commands/index.js';
import type { Prompter } from '../src/prompts.js';
import { readState, stateLockPath, statePath, updateRepoState } from '../src/state.js';
import { withFileLock } from '../src/util/lock.js';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

let sandbox: string;
let repo: string;

beforeEach(async () => {
  sandbox = await realpath(await mkdtemp(path.join(os.tmpdir(), 'para-')));
  process.env.PARA_SPACE_HOME = path.join(sandbox, 'home');
  repo = path.join(sandbox, 'app');
  await mkdir(path.join(repo, 'node_modules', 'left-pad'), { recursive: true });
  await mkdir(path.join(repo, '.venv', 'bin'), { recursive: true });
  await writeFile(path.join(repo, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1;\n');
  await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'app', devDependencies: { vite: '^5' } }));
  await writeFile(path.join(repo, 'requirements.txt'), '');
  await writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.venv/\n.env\n.env.local\n');
  await writeFile(path.join(repo, '.env'), 'SECRET=shh\n');
  await writeFile(path.join(repo, '.env.local'), 'PORT=3000\nDEBUG=1\n');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'add', '.');
  git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
});

afterEach(async () => {
  delete process.env.PARA_SPACE_HOME;
  await rm(sandbox, { recursive: true, force: true });
});

const stubPrompter = (ide: boolean): Prompter => ({
  selectPortStrategy: async () => ({ portStrategy: 'offset', basePort: 3000 }),
  confirmIdeSettings: async () => ide,
});

describe('worktree lifecycle', () => {
  it('create → list → isolate → remove', async () => {
    const res = await createWorktree({
      cwd: repo,
      branch: 'feat/TK-101',
      base: 'main',
      prompter: stubPrompter(true),
      requirement: 'Auth redesign',
    });
    const wt = path.join(sandbox, 'app-feat-TK-101');
    expect(res.path).toBe(wt);
    expect(res.port).toBe(3001);

    // config persisted with vite key detected; ledger gitignored
    const config = JSON.parse(await readFile(path.join(repo, '.para-space.json'), 'utf8'));
    expect(config).toEqual({ portStrategy: 'offset', basePort: 3000, envKeys: ['PORT', 'VITE_PORT'] });
    expect(await readFile(path.join(repo, '.gitignore'), 'utf8')).toContain('.para-space/');

    // absolute symlinks into main
    for (const rel of ['node_modules', '.venv', '.env']) {
      expect((await lstat(path.join(wt, rel))).isSymbolicLink()).toBe(true);
      expect(await readlink(path.join(wt, rel))).toBe(path.join(repo, rel));
    }
    // .env.local is a real copy with the port upserted
    expect((await lstat(path.join(wt, '.env.local'))).isSymbolicLink()).toBe(false);
    expect(await readFile(path.join(wt, '.env.local'), 'utf8')).toBe('PORT=3001\nDEBUG=1\nVITE_PORT=3001\n');
    expect(await readFile(path.join(repo, '.env.local'), 'utf8')).toBe('PORT=3000\nDEBUG=1\n');

    // IDE settings written with consent, interpreter path absolute
    const settings = JSON.parse(await readFile(path.join(wt, '.vscode', 'settings.json'), 'utf8'));
    expect(settings['workbench.colorCustomizations']['titleBar.activeBackground']).toBe('#008080');
    expect(settings['python.defaultInterpreterPath']).toBe(path.join(wt, '.venv', 'bin', 'python'));

    // links excluded via info/exclude → worktree status shows only the (untracked) .vscode dir
    const exclude = await readFile(path.join(repo, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude).toContain('/node_modules');
    expect(git(wt, 'status', '--porcelain')).toBe('?? .vscode/');

    // ledger
    const ledger = await readFile(path.join(repo, '.para-space', 'context-history.md'), 'utf8');
    expect(ledger).toContain('Worktree Provisioned: feat/TK-101');
    expect(ledger).toContain('Auth redesign');

    // second worktree gets next port; no prompt for strategy now
    const res2 = await createWorktree({ cwd: wt, branch: 'feat/TK-102', ide: 'no' });
    expect(res2.port).toBe(3002);

    const rows = await listWorktrees({ cwd: repo });
    expect(rows.map((r) => [r.name, r.port, r.depsMode])).toEqual([
      ['(main)', 3000, 'Source'],
      ['app-feat-TK-101', 3001, 'Symlinked'],
      ['app-feat-TK-102', 3002, 'Symlinked'],
    ]);

    // isolate (Node via CoW clone; Python would create a real venv — stub it by removing the venv link first)
    await rm(path.join(wt, '.venv'));
    const iso = await isolateWorktree({ cwd: repo, target: 'feat/TK-101' });
    expect(iso.isolated).toEqual(['NodeStrategy']);
    expect((await lstat(path.join(wt, 'node_modules'))).isDirectory()).toBe(true);
    expect(await readFile(path.join(wt, 'node_modules', 'left-pad', 'index.js'), 'utf8')).toContain('module.exports');
    expect((await listWorktrees({ cwd: repo }))[1].depsMode).toBe('Isolated');

    // remove: dirty worktree refused without --force
    await expect(removeWorktree({ cwd: repo, target: 'feat/TK-101', deleteBranch: true })).rejects.toThrow(
      /uncommitted/,
    );
    await rm(path.join(wt, '.vscode'), { recursive: true });
    await removeWorktree({ cwd: repo, target: 'feat/TK-101', deleteBranch: true });
    await removeWorktree({ cwd: repo, target: 'app-feat-TK-102', deleteBranch: true });

    // main deps untouched, branches gone, state empty
    expect(await readFile(path.join(repo, 'node_modules', 'left-pad', 'index.js'), 'utf8')).toContain('module.exports');
    expect((await lstat(path.join(repo, '.venv'))).isDirectory()).toBe(true);
    expect(await readFile(path.join(repo, '.env'), 'utf8')).toBe('SECRET=shh\n');
    expect(git(repo, 'branch', '--list', 'feat/*')).toBe('');
    expect((await readState()).repos[repo].worktrees).toEqual([]);
  });

  it('list writes state.json only when it prunes (D-031)', async () => {
    await listWorktrees({ cwd: repo });
    await expect(lstat(statePath())).rejects.toThrow(); // nothing to prune → never written

    const wt = (await createWorktree({ cwd: repo, branch: 'feat/x' })).path;
    const before = (await lstat(statePath())).mtimeMs;
    await listWorktrees({ cwd: repo });
    expect((await lstat(statePath())).mtimeMs).toBe(before);

    git(repo, 'worktree', 'remove', '--force', wt); // removed behind para's back → stale record
    await listWorktrees({ cwd: repo });
    expect((await readState()).repos[repo].worktrees).toEqual([]);
  });

  it('non-interactive: no prompter → offset default, IDE untouched', async () => {
    const res = await createWorktree({ cwd: repo, branch: 'agent/task' });
    expect(res.port).toBe(3001);
    expect(res.ideSettingsFile).toBeUndefined();
  });

  it('rolls back the worktree and branch when a step fails', async () => {
    await writeFile(path.join(repo, '.para-space.json'), JSON.stringify({ portStrategy: 'pool', portPool: [3000] }));
    await expect(createWorktree({ cwd: repo, branch: 'feat/fail' })).rejects.toThrow(/exhausted/);
    expect(git(repo, 'worktree', 'list').split('\n')).toHaveLength(1);
    expect(git(repo, 'branch', '--list', 'feat/fail')).toBe('');
    // main's node_modules survived the rollback
    expect((await lstat(path.join(repo, 'node_modules'))).isDirectory()).toBe(true);
    // the slot reservation was released
    expect((await readState()).repos[repo]?.worktrees ?? []).toEqual([]);
  });
});

describe('concurrency (D-027)', () => {
  it('parallel state updates never lose writes', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        updateRepoState(repo, (r) => {
          r.worktrees.push({
            branch: `b${i}`,
            path: `/x/${i}`,
            index: i + 1,
            links: [],
            isolated: false,
            createdAt: '',
          });
        }),
      ),
    );
    expect((await readState()).repos[repo].worktrees).toHaveLength(20);
    await expect(lstat(stateLockPath())).rejects.toThrow(); // lock released
  });

  it('parallel creates get distinct indices and ports', async () => {
    const results = await Promise.all(
      ['a', 'b', 'c'].map((b) => createWorktree({ cwd: repo, branch: `feat/${b}`, base: 'main' })),
    );
    expect(results.map((r) => r.port).sort()).toEqual([3001, 3002, 3003]);
    const indices = (await readState()).repos[repo].worktrees.map((w) => w.index).sort();
    expect(indices).toEqual([1, 2, 3]);
  });

  it('reclaims a lock left by a dead process, but waits on a live one', async () => {
    const lock = path.join(sandbox, 'test.lock');
    const hold = (pid: number) => writeFile(lock, JSON.stringify({ pid, host: os.hostname(), acquiredAt: Date.now() }));

    await hold(2 ** 22 + 12345); // above macOS/Linux pid limits → not alive
    expect(await withFileLock(lock, async () => 'ok', { timeoutMs: 500 })).toBe('ok');

    await hold(process.pid);
    await expect(withFileLock(lock, async () => 'ok', { timeoutMs: 200 })).rejects.toThrow(/Timed out/);
  });
});
