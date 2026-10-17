import { getConfig, PORT_STRATEGY_NAMES, type PortStrategyName, updateConfig } from '@para-space/core';
import { type Command, Option } from 'commander';
import pc from 'picocolors';
import { action, log, ok, printJson, prompterFor } from '../runtime.js';

interface Flags {
  portStrategy?: PortStrategyName;
  basePort?: number;
  portPool?: string;
  requirement?: string;
  yes?: boolean;
  json?: boolean;
}

export function registerConfig(program: Command) {
  program
    .command('config')
    .description('View or update repository configuration (.para-space.json)')
    .addOption(new Option('--port-strategy <name>', 'port strategy to use').choices([...PORT_STRATEGY_NAMES]))
    .option('--base-port <port>', 'base port number', (v) => parseInt(v, 10))
    .option('--port-pool <range>', 'port pool range, e.g. 3001-3020')
    .option('-r, --requirement <text>', 'reason for update (recorded in context ledger)')
    .option('-y, --yes', 'non-interactive mode')
    .option('--json', 'print configuration as JSON')
    .action(
      action(async (flags: Flags) => {
        const { portStrategy, basePort, portPool, requirement, yes, json } = flags;
        const cwd = process.cwd();

        const hasUpdateFlags = portStrategy !== undefined || basePort !== undefined || portPool !== undefined;
        const prompter = prompterFor(yes);

        if (!hasUpdateFlags && (!prompter || yes)) {
          const { config, root } = await getConfig(cwd);
          if (!config) {
            if (json) {
              printJson({ configured: false, root });
            } else {
              console.log(pc.yellow(`No .para-space.json found at ${root}. Run with --port-strategy to create one.`));
            }
            return;
          }
          if (json) {
            printJson(config);
          } else {
            console.log(pc.bold(`ParaSpace configuration (${root}):`));
            console.log(`  portStrategy  ${config.portStrategy}`);
            console.log(`  basePort      ${config.basePort}`);
            console.log(`  envKeys       ${config.envKeys.join(', ')}`);
            if (config.portPool) console.log(`  portPool      ${config.portPool}`);
          }
          return;
        }

        const res = await updateConfig({
          cwd,
          portStrategy,
          basePort,
          portPool,
          prompter,
          reason: requirement,
          log,
        });

        if (json) {
          printJson(res);
        } else {
          ok(`Configuration saved to .para-space.json`);
          console.log(`  portStrategy  ${res.config.portStrategy}`);
          console.log(`  basePort      ${res.config.basePort}`);
          console.log(`  envKeys       ${res.config.envKeys.join(', ')}`);
          if (res.config.portPool) console.log(`  portPool      ${res.config.portPool}`);
        }
      }),
    );
}
