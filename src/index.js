'use strict';

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');

const CodebaseAnalyzer  = require('./analyzers/codebase');
const MonorepoAnalyzer  = require('./analyzers/monorepo');
const HostingDetector   = require('./detectors/hosting');
const FrameworkDetector = require('./detectors/framework');
const LanguageDetector  = require('./detectors/language');
const TestingDetector   = require('./detectors/testing');
const ReleaseDetector   = require('./detectors/release');
const EnvDetector       = require('./detectors/env');
const WorkflowGenerator = require('./generators/workflow');
const DependabotGenerator = require('./generators/dependabot');
const ReleaseGenerator  = require('./generators/release');
const ConfigLoader      = require('./config/loader');
const { ensureDir, writeFile, banner, smartMergeWorkflow } = require('./utils/helpers');

const WorkflowAnalyzer = require('./analyzers/workflow');

class CIFlow {
  constructor(options) {
    this.options = options;
    this.projectPath = options.projectPath;
    this.outputDir = path.join(options.projectPath, options.outputDir || '.github/workflows');
    this.dryRun    = options.dryRun  || false;
    this.force     = options.force   || false;
    this.prompt    = options.prompt  !== false;
    this.verbose   = options.verbose || false;
    this.explain   = options.explain || false;
  }

  async run() {
    banner();

    const spinner = ora({ text: 'Scanning project...', color: 'cyan' }).start();

    try {
      // ── 1. Load cistack.config.js ─────────────────────────────────────
      const configLoader = new ConfigLoader(this.projectPath);
      const userConfig = configLoader.load();
      if (Object.keys(userConfig).length > 0) {
        spinner.info(chalk.cyan('cistack.config.js loaded'));
        spinner.start('Scanning project...');
        // Allow config to override outputDir
        if (userConfig.outputDir) {
          this.outputDir = path.join(this.projectPath, userConfig.outputDir);
        }
      }

      // ── 2. Analyse the codebase ───────────────────────────────────────
      const analyzer = new CodebaseAnalyzer(this.projectPath, { verbose: this.verbose });
      const codebaseInfo = await analyzer.analyse();
      spinner.succeed(chalk.green('Project scanned'));

      if (this.verbose) {
        console.log('\n' + chalk.dim(JSON.stringify(codebaseInfo, null, 2)));
      }

      // ── 3. Detect stack + extras in parallel ──────────────────────────
      spinner.start('Detecting stack...');
      const [hosting, frameworks, languages, testing, releaseInfo, envVars, monorepoPackages] =
        await Promise.all([
          new HostingDetector(this.projectPath, codebaseInfo).detect(),
          new FrameworkDetector(this.projectPath, codebaseInfo).detect(),
          new LanguageDetector(this.projectPath, codebaseInfo).detect(),
          new TestingDetector(this.projectPath, codebaseInfo).detect(),
          new ReleaseDetector(this.projectPath, codebaseInfo).detect(),
          new EnvDetector(this.projectPath, codebaseInfo).detect(),
          new MonorepoAnalyzer(this.projectPath, codebaseInfo).analyze(),
        ]);
      spinner.succeed(chalk.green('Stack detected'));

      // ── 4. Apply cistack.config.js overrides ──────────────────────────
      let finalConfig = ConfigLoader.applyToStack(userConfig, {
        hosting,
        frameworks,
        languages,
        testing,
        envVars,
        monorepoPackages,
        _config: userConfig,
      });

      // ── 5. Print summary ───────────────────────────────────────────────
      this._printSummary(finalConfig, releaseInfo, envVars, monorepoPackages);

      // ── 6. Optional interactive confirmation ──────────────────────────
      if (this.prompt) {
        finalConfig = await this._interactiveConfirm(finalConfig);
      }

      // ── 7. Generate CI/CD workflow(s) ─────────────────────────────────
      spinner.start('Generating workflow(s)...');
      const generator = new WorkflowGenerator(finalConfig, this.projectPath);
      const workflows = generator.generate();
      spinner.succeed(chalk.green(`Generated ${workflows.length} CI workflow(s)`));

      // ── 8. Generate dependabot.yml ────────────────────────────────────
      const dependabotGen = new DependabotGenerator(codebaseInfo);
      const dependabotFile = dependabotGen.generate();

      // ── 9. Generate release.yml (if release tooling detected) ─────────
      let releaseWorkflow = null;
      if (releaseInfo) {
        const releaseGen = new ReleaseGenerator(releaseInfo, finalConfig, this.projectPath);
        releaseWorkflow = releaseGen.generate();
        if (releaseWorkflow) workflows.push(releaseWorkflow);
      }

      // ── 10. Write files ────────────────────────────────────────────────
      if (this.dryRun) {
        this._dryRunPrint(workflows, dependabotFile);
      } else {
        await this._writeWorkflows(workflows);
        await this._writeDependabot(dependabotFile);
      }

      console.log('\n' + chalk.bold.green('✅  Done! Your GitHub Actions pipeline is ready.'));
      if (!this.dryRun) {
        console.log(chalk.dim(`   Workflows → ${this.outputDir}`));
        console.log(chalk.dim(`   Dependabot → ${path.join(this.projectPath, '.github', 'dependabot.yml')}\n`));
      }
    } catch (err) {
      spinner.fail(chalk.red('Failed: ' + err.message));
      if (this.verbose) console.error(err);
      process.exit(1);
    }
  }

  async audit() {
    banner();
    const spinner = ora({ text: 'Auditing existing workflows...', color: 'cyan' }).start();
    
    try {
      const analyzer = new WorkflowAnalyzer(this.projectPath);
      const results = await analyzer.audit();
      spinner.succeed(chalk.green('Audit complete'));

      if (results.files.length === 0) {
        console.log(chalk.yellow('\nNo workflow files found to audit.'));
        return;
      }

      console.log('\n' + chalk.bold('🔍 Workflow Audit Results'));
      console.log(chalk.dim('─'.repeat(48)));

      for (const file of results.files) {
        if (file.error) {
          console.log(`\n📄 ${chalk.red(file.filename)} – ${chalk.red(file.error)}`);
          continue;
        }

        console.log(`\n📄 ${chalk.cyan(file.filename)} – ${file.issues.length > 0 ? chalk.yellow(file.issues.length + ' issues found') : chalk.green('Excellent')}`);
        
        for (const issue of file.issues) {
          const color = issue.severity === 'high' ? chalk.red : issue.severity === 'medium' ? chalk.yellow : chalk.dim;
          console.log(`  ${color('•')} ${issue.message}`);
          console.log(`    ${chalk.dim('Fix:')} ${chalk.italic(issue.fix)}`);
        }
      }

      if (results.totalIssues > 0) {
        console.log('\n' + chalk.yellow(`💡 Run ${chalk.bold('cistack upgrade')} to automatically fix outdated actions.`));
      } else {
        console.log('\n' + chalk.green('✅  Your workflows are up to date and follow best practices.'));
      }
      console.log('');
    } catch (err) {
      spinner.fail(chalk.red('Audit failed: ' + err.message));
      process.exit(1);
    }
  }

  async upgrade() {
    banner();
    const spinner = ora({ text: 'Upgrading actions...', color: 'cyan' }).start();
    
    try {
      const analyzer = new WorkflowAnalyzer(this.projectPath);
      const results = await analyzer.upgrade(this.dryRun);
      
      if (results.changes === 0) {
        spinner.succeed(chalk.green('All actions are already up to date.'));
        return;
      }

      spinner.succeed(chalk.green(`Upgraded ${results.changes} action(s) across ${results.upgradedFiles.length} file(s)`));
      
      if (this.dryRun) {
        console.log(chalk.yellow('\n── DRY RUN – files not modified ──'));
      }

      for (const file of results.upgradedFiles) {
        console.log(`  ${chalk.green('✔')} ${file.filename} (${file.changes} changes)`);
      }
      console.log('');
    } catch (err) {
      spinner.fail(chalk.red('Upgrade failed: ' + err.message));
      process.exit(1);
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  _printSummary(config, releaseInfo, envVars, monorepoPackages) {
    const { hosting, frameworks, languages, testing } = config;
    const line = (label, value, reasons = []) => {
      console.log(`  ${chalk.dim(label.padEnd(20))} ${chalk.cyan(value || chalk.italic('none detected'))}`);
      if (this.explain && reasons && reasons.length > 0) {
        for (const reason of reasons) {
          console.log(`    ${chalk.dim('↳')} ${chalk.italic.gray(reason)}`);
        }
      }
    };

    console.log('\n' + chalk.bold('  📊 Detected Stack'));
    console.log(chalk.dim('  ' + '─'.repeat(48)));
    
    line('Languages:',   languages.map((l) => l.name).join(', '), languages[0] && languages[0].reasons);
    line('Frameworks:',  frameworks.map((f) => f.name).join(', '), frameworks[0] && frameworks[0].reasons);
    line('Hosting:',     hosting.map((h) => h.name).join(', ') || 'none', hosting[0] && hosting[0].reasons);
    line('Testing:',     testing.map((t) => t.name).join(', ')  || 'none', testing[0] && testing[0].reasons);
    line('Release tool:', releaseInfo ? releaseInfo.tool : 'none', releaseInfo && releaseInfo.reasons);

    if (monorepoPackages.length > 0) {
      line('Monorepo pkgs:', monorepoPackages.map((p) => p.name).join(', '));
    }

    if (envVars.sourceFile) {
      line('Env file:', envVars.sourceFile);
      if (envVars.secrets.length > 0) {
        line('  Secrets:', envVars.secrets.join(', '));
      }
      if (envVars.public.length > 0) {
        line('  Public vars:', envVars.public.join(', '));
      }
    }

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
        .map((h) => ({ name: h, confidence: 1.0, manual: true, secrets: [] }));
    }

    return config;
  }

  // ── Dry run ───────────────────────────────────────────────────────────────

  _dryRunPrint(workflows, dependabotFile) {
    console.log('\n' + chalk.yellow('── DRY RUN – files not written ──\n'));

    for (const wf of workflows) {
      console.log(chalk.bold.cyan(`\n📄 .github/workflows/${wf.filename}`));
      console.log(chalk.dim('─'.repeat(60)));
      console.log(wf.content);
    }

    console.log(chalk.bold.cyan(`\n📄 .github/dependabot.yml`));
    console.log(chalk.dim('─'.repeat(60)));
    console.log(dependabotFile.content);
  }

  // ── Write workflows ────────────────────────────────────────────────────────

  async _writeWorkflows(workflows) {
    ensureDir(this.outputDir);

    for (const wf of workflows) {
      const filePath = path.join(this.outputDir, wf.filename);
      const exists   = fs.existsSync(filePath);

      if (exists && !this.force) {
        const existing = fs.readFileSync(filePath, 'utf8');
        const { content: merged, changes } = smartMergeWorkflow(existing, wf.content);

        if (changes.length === 0) {
          console.log(chalk.dim(`  ○ No changes: ${wf.filename}`));
          continue;
        }

        console.log(chalk.yellow(`  ↻ Smart-merged: ${wf.filename}`));
        for (const c of changes) {
          console.log(chalk.dim(`    • ${c}`));
        }

        writeFile(filePath, merged);
      } else if (exists && this.force) {
        writeFile(filePath, wf.content);
        console.log(chalk.green(`  ✔ Overwritten:  ${wf.filename}`));
      } else {
        writeFile(filePath, wf.content);
        console.log(chalk.green(`  ✔ Written:      ${wf.filename}`));
      }
    }
  }

  // ── Write dependabot.yml ───────────────────────────────────────────────────

  async _writeDependabot(dependabotFile) {
    const githubDir = path.join(this.projectPath, '.github');
    const filePath  = path.join(githubDir, 'dependabot.yml');
    const exists    = fs.existsSync(filePath);

    ensureDir(githubDir);

    if (exists && !this.force) {
      const existing = fs.readFileSync(filePath, 'utf8');
      const { content: merged, changes } = smartMergeWorkflow(existing, dependabotFile.content);

      if (changes.length === 0) {
        console.log(chalk.dim(`  ○ No changes: dependabot.yml`));
        return;
      }

      writeFile(filePath, merged);
      console.log(chalk.yellow(`  ↻ Smart-merged: dependabot.yml`));
      for (const c of changes) {
        console.log(chalk.dim(`    • ${c}`));
      }
    } else {
      writeFile(filePath, dependabotFile.content);
      console.log(chalk.green(`  ✔ Written:      .github/dependabot.yml`));
    }
  }
}

module.exports = CIFlow;
