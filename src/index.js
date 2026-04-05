'use strict';

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');

const CodebaseAnalyzer = require('./analyzers/codebase');
const HostingDetector = require('./detectors/hosting');
const FrameworkDetector = require('./detectors/framework');
const LanguageDetector = require('./detectors/language');
const TestingDetector = require('./detectors/testing');
const WorkflowGenerator = require('./generators/workflow');
const { ensureDir, writeFile, banner } = require('./utils/helpers');

class CIFlow {
  constructor(options) {
    this.options = options;
    this.projectPath = options.projectPath;
    this.outputDir = path.join(options.projectPath, options.outputDir);
    this.dryRun = options.dryRun || false;
    this.force = options.force || false;
    this.prompt = options.prompt !== false;
    this.verbose = options.verbose || false;
  }

  async run() {
    banner();

    const spinner = ora({ text: 'Scanning project...', color: 'cyan' }).start();

    try {
      // ── 1. Analyse the codebase ──────────────────────────────────────────
      const analyzer = new CodebaseAnalyzer(this.projectPath, { verbose: this.verbose });
      const codebaseInfo = await analyzer.analyse();
      spinner.succeed(chalk.green('Project scanned'));

      if (this.verbose) {
        console.log('\n' + chalk.dim(JSON.stringify(codebaseInfo, null, 2)));
      }

      // ── 2. Detect everything ─────────────────────────────────────────────
      spinner.start('Detecting stack...');
      const [hosting, frameworks, languages, testing] = await Promise.all([
        new HostingDetector(this.projectPath, codebaseInfo).detect(),
        new FrameworkDetector(this.projectPath, codebaseInfo).detect(),
        new LanguageDetector(this.projectPath, codebaseInfo).detect(),
        new TestingDetector(this.projectPath, codebaseInfo).detect(),
      ]);
      spinner.succeed(chalk.green('Stack detected'));

      // ── 3. Print summary ─────────────────────────────────────────────────
      this._printSummary({ hosting, frameworks, languages, testing });

      // ── 4. Optional interactive confirmation ─────────────────────────────
      let finalConfig = { hosting, frameworks, languages, testing };
      if (this.prompt) {
        finalConfig = await this._interactiveConfirm(finalConfig);
      }

      // ── 5. Generate workflow(s) ──────────────────────────────────────────
      spinner.start('Generating workflow(s)...');
      const generator = new WorkflowGenerator(finalConfig, this.projectPath);
      const workflows = generator.generate();
      spinner.succeed(chalk.green(`Generated ${workflows.length} workflow(s)`));

      // ── 6. Write files ───────────────────────────────────────────────────
      if (this.dryRun) {
        console.log('\n' + chalk.yellow('── DRY RUN – files not written ──\n'));
        for (const wf of workflows) {
          console.log(chalk.bold.cyan(`\n📄 ${wf.filename}`));
          console.log(chalk.dim('─'.repeat(60)));
          console.log(wf.content);
        }
      } else {
        await this._writeWorkflows(workflows);
      }

      console.log('\n' + chalk.bold.green('✅  Done! Your GitHub Actions pipeline is ready.'));
      if (!this.dryRun) {
        console.log(chalk.dim(`   → ${this.outputDir}\n`));
      }
    } catch (err) {
      spinner.fail(chalk.red('Failed: ' + err.message));
      if (this.verbose) console.error(err);
      process.exit(1);
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  _printSummary({ hosting, frameworks, languages, testing }) {
    const line = (label, value) =>
      console.log(`  ${chalk.dim(label.padEnd(18))} ${chalk.cyan(value || chalk.italic('none detected'))}`);

    console.log('\n' + chalk.bold('  📊 Detected Stack'));
    console.log(chalk.dim('  ' + '─'.repeat(40)));
    line('Languages:', languages.map((l) => l.name).join(', '));
    line('Frameworks:', frameworks.map((f) => f.name).join(', '));
    line('Hosting:', hosting.map((h) => h.name).join(', ') || 'none');
    line('Testing:', testing.map((t) => t.name).join(', ') || 'none');
    console.log('');
  }

  async _interactiveConfirm(config) {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Does this look correct? Generate pipeline with these settings?',
        default: true,
      },
    ]);

    if (!confirmed) {
      console.log(chalk.yellow('\nCustomisation mode – answer the prompts below:\n'));

      const hostingChoices = ['firebase', 'vercel', 'netlify', 'aws', 'gcp', 'azure', 'heroku', 'render', 'railway', 'none'];
      const { customHosting } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'customHosting',
          message: 'Select hosting platform(s):',
          choices: hostingChoices,
          default: config.hosting.map((h) => h.name.toLowerCase()),
        },
      ]);

      config.hosting = customHosting
        .filter((h) => h !== 'none')
        .map((h) => ({ name: h, confidence: 1.0, manual: true }));
    }

    return config;
  }

  async _writeWorkflows(workflows) {
    ensureDir(this.outputDir);

    for (const wf of workflows) {
      const filePath = path.join(this.outputDir, wf.filename);
      const exists = fs.existsSync(filePath);

      if (exists && !this.force) {
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: `${wf.filename} already exists. Overwrite?`,
            default: false,
          },
        ]);
        if (!overwrite) {
          console.log(chalk.dim(`  Skipped ${wf.filename}`));
          continue;
        }
      }

      writeFile(filePath, wf.content);
      console.log(chalk.green(`  ✔ Written: ${wf.filename}`));
    }
  }
}

module.exports = CIFlow;
