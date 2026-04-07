#!/usr/bin/env node

'use strict';

const { program } = require('commander');
const path = require('path');
const CIFlow = require('../src/index');

const { version } = require('../package.json');

program
  .name('cistack')
  .description('Generate GitHub Actions CI/CD pipelines by analysing your codebase')
  .version(version);

program
  .command('generate', { isDefault: true })
  .description('Analyse codebase and generate GitHub Actions workflow(s)')
  .option('-p, --path <dir>', 'Path to the project root', process.cwd())
  .option('-o, --output <dir>', 'Output directory for workflow files', '.github/workflows')
  .option('--dry-run', 'Print the generated YAML without writing files')
  .option('--force', 'Overwrite existing workflow files without smart-merge')
  .option('--no-prompt', 'Skip interactive prompts and use detected settings')
  .option('--verbose', 'Show detailed analysis output')
  .option('--explain', 'Show reasoning for detected stack')
  .action(async (options) => {
    const ciflow = new CIFlow({
      projectPath: path.resolve(options.path),
      outputDir:   options.output,
      dryRun:      options.dryRun,
      force:       options.force,
      prompt:      options.prompt,
      verbose:     options.verbose,
      explain:     options.explain,
    });
    await ciflow.run();
  });

program
  .command('audit')
  .description("Analyse existing .github/workflows/ folder and suggest fixes")
  .option('-p, --path <dir>', 'Path to the project root', process.cwd())
  .action(async (options) => {
    const ciflow = new CIFlow({ projectPath: path.resolve(options.path) });
    await ciflow.audit();
  });

program
  .command('upgrade')
  .description("Automatically bump action versions across all workflow files")
  .option('-p, --path <dir>', 'Path to the project root', process.cwd())
  .option('--dry-run', 'Show what would be upgraded without modifying files')
  .action(async (options) => {
    const ciflow = new CIFlow({ 
      projectPath: path.resolve(options.path),
      dryRun: options.dryRun
    });
    await ciflow.upgrade();
  });

program
  .command('init')
  // ... rest of init
  .description('Create a starter cistack.config.js in the current directory')
  .option('-p, --path <dir>', 'Path to the project root', process.cwd())
  .action(async (options) => {
    const fs = require('fs');
    const resolvedPath = path.resolve(options.path);
    const configPath = path.join(resolvedPath, 'cistack.config.js');

    // Ensure the target directory exists
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }

    if (fs.existsSync(configPath)) {
      console.error('cistack.config.js already exists. Delete it first or edit it manually.');
      process.exit(1);
    }

    const template = `// cistack.config.js
// Override auto-detected settings for this project.
// All fields are optional — omit what you don't need.

/** @type {import('cistack').Config} */
module.exports = {
  // nodeVersion: '20',          // Override detected Node.js version
  // packageManager: 'pnpm',    // 'npm' | 'yarn' | 'pnpm' | 'bun'
  // hosting: ['Firebase'],      // Force a specific hosting provider
  // branches: ['main', 'staging'], // CI branches (default: detected git default branch, then main/master/develop)
  // outputDir: '.github/workflows', // Where to write workflow files

  // cache: {
  //   npm: true,     // enabled by default
  //   pip: true,
  //   cargo: true,
  //   maven: true,
  //   gradle: true,
  //   go: true,
  //   composer: true,
  // },

  // monorepo: {
  //   perPackage: true, // Generate one ci-<name>.yml per workspace
  // },

  // release: {
  //   tool: 'semantic-release', // override release tool detection
  // },

  // secrets: ['MY_EXTRA_SECRET'], // Document additional secrets in workflow comments
};
`;

    fs.writeFileSync(configPath, template, 'utf8');
    const chalk = require('chalk');
    console.log(chalk.green(`✔ Created cistack.config.js at ${configPath}`));
    console.log(chalk.dim('  Edit the file to override detected settings.'));
  });

program.parse(process.argv);
