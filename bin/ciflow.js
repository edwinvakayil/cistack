#!/usr/bin/env node

'use strict';

const { program } = require('commander');
const path = require('path');
const CIFlow = require('../src/index');

program
  .name('cistack')
  .description('Generate GitHub Actions CI/CD pipelines by analysing your codebase')
  .version('1.0.0');

program
  .command('generate', { isDefault: true })
  .description('Analyse codebase and generate GitHub Actions workflow(s)')
  .option('-p, --path <dir>', 'Path to the project root', process.cwd())
  .option('-o, --output <dir>', 'Output directory for workflow files', '.github/workflows')
  .option('--dry-run', 'Print the generated YAML without writing files')
  .option('--force', 'Overwrite existing workflow files without prompting')
  .option('--no-prompt', 'Skip interactive prompts and use detected settings')
  .option('--verbose', 'Show detailed analysis output')
  .action(async (options) => {
    const ciflow = new CIFlow({
      projectPath: path.resolve(options.path),
      outputDir: options.output,
      dryRun: options.dryRun,
      force: options.force,
      prompt: options.prompt,
      verbose: options.verbose,
    });
    await ciflow.run();
  });

program.parse(process.argv);
