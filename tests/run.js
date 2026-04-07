'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const yaml = require('js-yaml');

const CodebaseAnalyzer = require('../src/analyzers/codebase');
const ConfigLoader = require('../src/config/loader');
const DependabotGenerator = require('../src/generators/dependabot');
const FrameworkDetector = require('../src/detectors/framework');
const HostingDetector = require('../src/detectors/hosting');
const LanguageDetector = require('../src/detectors/language');
const ReleaseDetector = require('../src/detectors/release');
const TestingDetector = require('../src/detectors/testing');
const WorkflowGenerator = require('../src/generators/workflow');
const ReleaseGenerator = require('../src/generators/release');
const combineWorkflows = require('../src/utils/workflow-combiner');
const { smartMergeWorkflow } = require('../src/utils/helpers');

const repoRoot = path.resolve(__dirname, '..');
const tempDirs = [];
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

function makeTempDir(prefix = 'cistack-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }
}

function stripHeader(content) {
  return content.replace(/^(?:#[^\n]*\n)+\n?/, '');
}

function parseWorkflow(content) {
  return yaml.load(stripHeader(content));
}

function runGit(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function makeJsProject(extra = {}) {
  return {
    hosting: extra.hosting || [],
    frameworks: extra.frameworks || [],
    languages: extra.languages || [{ name: 'JavaScript', packageManager: 'npm', nodeVersion: '20' }],
    testing: extra.testing || [],
    envVars: extra.envVars || { secrets: [], public: [], all: [], sourceFile: null },
    monorepoPackages: extra.monorepoPackages || [],
    lockFiles: extra.lockFiles || [],
    defaultBranch: extra.defaultBranch || null,
    currentBranch: extra.currentBranch || null,
    _config: extra._config || {},
  };
}

test('ConfigLoader applies testing overrides using the overridden package manager', () => {
  const result = ConfigLoader.applyToStack(
    { packageManager: 'pnpm', testing: ['Vitest'] },
    {
      hosting: [],
      frameworks: [],
      languages: [{ name: 'JavaScript', packageManager: 'npm', nodeVersion: '20' }],
      testing: [],
      envVars: { secrets: [], public: [], all: [], sourceFile: null },
      monorepoPackages: [],
    }
  );

  assert.equal(result.testing[0].command, 'pnpm run test');
  assert.equal(result.languages[0].packageManager, 'pnpm');
});

test('ConfigLoader merges release overrides with detected release info and documents extra secrets', () => {
  const result = ConfigLoader.applyToStack(
    {
      release: 'semantic-release',
      secrets: ['MY_EXTRA_SECRET'],
    },
    {
      hosting: [],
      frameworks: [],
      languages: [{ name: 'JavaScript', packageManager: 'npm', nodeVersion: '20' }],
      testing: [],
      releaseInfo: {
        tool: 'semantic-release',
        publishToNpm: true,
        requiresNpmToken: true,
      },
      envVars: { secrets: ['BASE_SECRET'], public: [], all: [], sourceFile: null },
      monorepoPackages: [],
    }
  );

  assert.deepEqual(result.releaseInfo, {
    tool: 'semantic-release',
    publishToNpm: true,
    requiresNpmToken: true,
  });
  assert.deepEqual(result.envVars.secrets.sort(), ['BASE_SECRET', 'MY_EXTRA_SECRET'].sort());
});

test('LanguageDetector treats Kotlin projects as Gradle-based JVM builds', async () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'build.gradle.kts': "plugins { kotlin(\"jvm\") version \"1.9.0\" }\n",
    'src/main/kotlin/App.kt': 'fun main() = println("hi")\n',
  });

  const info = await new CodebaseAnalyzer(projectDir).analyse();
  const languages = await new LanguageDetector(projectDir, info).detect();
  const kotlin = languages.find((lang) => lang.name === 'Kotlin');

  assert(kotlin);
  assert.equal(kotlin.packageManager, 'gradle');
});

test('FrameworkDetector detects Spring Boot from build.gradle.kts', async () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'build.gradle.kts': "plugins { id(\"org.springframework.boot\") version \"3.3.0\" }\n",
    'src/main/kotlin/App.kt': 'fun main() = println("hi")\n',
  });

  const info = await new CodebaseAnalyzer(projectDir).analyse();
  const frameworks = await new FrameworkDetector(projectDir, info).detect();

  assert(frameworks.some((framework) => framework.name === 'Spring Boot'));
});

test('HostingDetector recognizes Azure pipelines in azure/pipelines.yml', async () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'azure/pipelines.yml': 'trigger:\n- main\n',
  });

  const info = await new CodebaseAnalyzer(projectDir).analyse();
  const hosting = await new HostingDetector(projectDir, info).detect();

  assert(hosting.some((provider) => provider.name === 'Azure'));
});

test('Docker detection and Dependabot both honor Dockerfile.prod', async () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'Dockerfile.prod': 'FROM node:20-alpine\n',
  });

  const info = await new CodebaseAnalyzer(projectDir).analyse();
  const hosting = await new HostingDetector(projectDir, info).detect();
  const dependabot = parseWorkflow(new DependabotGenerator(info).generate().content);

  assert(hosting.some((provider) => provider.name === 'Docker'));
  assert(dependabot.updates.some((entry) => entry['package-ecosystem'] === 'docker'));
});

test('Dependabot skips empty npm manifests and uses the bun ecosystem for bun.lock', async () => {
  const emptyJsProject = makeTempDir();
  writeFiles(emptyJsProject, {
    'package.json': json({
      name: 'empty-js-app',
      version: '1.0.0',
      dependencies: {},
      devDependencies: {},
    }),
  });

  const emptyInfo = await new CodebaseAnalyzer(emptyJsProject).analyse();
  const emptyDependabot = parseWorkflow(new DependabotGenerator(emptyInfo).generate().content);
  assert.deepEqual(
    emptyDependabot.updates.map((entry) => entry['package-ecosystem']),
    ['github-actions']
  );

  const bunProject = makeTempDir();
  writeFiles(bunProject, {
    'package.json': json({
      name: 'bun-app',
      version: '1.0.0',
      dependencies: {
        react: '^18.3.1',
      },
    }),
    'bun.lock': '# bun lockfile v1\n',
  });

  const bunInfo = await new CodebaseAnalyzer(bunProject).analyse();
  const bunDependabot = parseWorkflow(new DependabotGenerator(bunInfo).generate().content);
  assert(bunDependabot.updates.some((entry) => entry['package-ecosystem'] === 'bun'));
  assert(!bunDependabot.updates.some((entry) => entry['package-ecosystem'] === 'npm'));
});

test('Dependabot groups GitHub Actions updates into a single pull request', async () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    '.github/workflows/ci.yml': [
      'name: CI',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-node@v4',
      '      - uses: actions/upload-artifact@v4',
    ].join('\n'),
  });

  const info = await new CodebaseAnalyzer(projectDir).analyse();
  const dependabot = parseWorkflow(new DependabotGenerator(info).generate().content);
  const gha = dependabot.updates.find((entry) => entry['package-ecosystem'] === 'github-actions');

  assert(gha);
  assert.deepEqual(gha.groups, {
    'github-actions-updates': {
      patterns: ['*'],
    },
  });
});

test('GCP App Engine detection documents only the secrets the generated deploy flow uses', async () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'app.yaml': 'runtime: nodejs20\n',
  });

  const info = await new CodebaseAnalyzer(projectDir).analyse();
  const hosting = await new HostingDetector(projectDir, info).detect();
  const gcp = hosting.find((provider) => provider.name === 'GCP App Engine');

  assert.deepEqual(gcp.secrets, ['GCP_SA_KEY']);
});

test('ReleaseDetector reads release-it CJS config and honors npm.publish false', async () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'release-it-fixture',
      version: '1.0.0',
      devDependencies: {
        'release-it': '^17.0.0',
      },
    }),
    '.release-it.cjs': "module.exports = { npm: { publish: false } };\n",
  });

  const info = await new CodebaseAnalyzer(projectDir).analyse();
  const release = await new ReleaseDetector(projectDir, info).detect();

  assert.equal(release.tool, 'release-it');
  assert.equal(release.publishToNpm, false);
  assert.equal(release.requiresNpmToken, false);
});

test('bun.lock is recognized as Bun across codebase, testing, and release detection', async () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'bun-lock-fixture',
      version: '1.0.0',
      dependencies: {
        react: '^18.3.1',
      },
      devDependencies: {
        vitest: '^3.0.0',
      },
      scripts: {
        test: 'vitest run',
        release: 'bun run release',
      },
    }),
    'bun.lock': '# bun lockfile v1\n',
  });

  const info = await new CodebaseAnalyzer(projectDir).analyse();
  const languages = await new LanguageDetector(projectDir, info).detect();
  const testing = await new TestingDetector(projectDir, info).detect();
  const release = await new ReleaseDetector(projectDir, info).detect();

  assert(info.lockFiles.includes('bun.lock'));
  assert.equal(languages[0].packageManager, 'bun');
  assert.equal(testing[0].command, 'bun run test');
  assert.equal(release.command, 'bun run release');
});

test('CodebaseAnalyzer detects the current git branch as the default branch fallback', async () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({ name: 'branch-fixture', version: '1.0.0' }),
  });

  try {
    runGit(projectDir, ['init', '-b', 'release']);
  } catch (_) {
    runGit(projectDir, ['init']);
    runGit(projectDir, ['checkout', '-b', 'release']);
  }

  const info = await new CodebaseAnalyzer(projectDir).analyse();
  assert.equal(info.currentBranch, 'release');
  assert.equal(info.defaultBranch, 'release');
});

test('WorkflowGenerator uses the detected default branch across CI, deploy, and security workflows', () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'branch-aware-app',
      version: '1.0.0',
      scripts: {
        test: 'echo ok',
      },
    }),
  });

  const generator = new WorkflowGenerator(
    makeJsProject({
      hosting: [{ name: 'Vercel', secrets: ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'] }],
      testing: [{ name: 'Vitest', type: 'unit', confidence: 1, command: 'npm run test' }],
      defaultBranch: 'release',
    }),
    projectDir
  );

  const workflows = generator.generate();
  const byName = Object.fromEntries(workflows.map((workflow) => [workflow.filename, parseWorkflow(workflow.content)]));

  assert.deepEqual(byName['ci.yml'].on.push.branches, ['release']);
  assert.deepEqual(byName['deploy.yml'].on.push.branches, ['release']);
  assert.deepEqual(byName['security.yml'].on.push.branches, ['release']);
});

test('combineWorkflows collapses generated workflows into a single pipeline file', () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'combined-pipeline-app',
      version: '1.0.0',
      scripts: {
        test: 'echo ok',
      },
    }),
  });

  const config = makeJsProject({
    hosting: [{ name: 'Vercel', secrets: ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'] }],
    testing: [{ name: 'Vitest', type: 'unit', confidence: 1, command: 'npm run test' }],
  });
  config.releaseInfo = { tool: 'custom', command: 'npm run release', publishToNpm: false, requiresNpmToken: false };
  const workflows = new WorkflowGenerator(config, projectDir).generate();
  workflows.push(new ReleaseGenerator(config.releaseInfo, config, projectDir).generate());

  const combined = combineWorkflows(workflows, { config, releaseInfo: config.releaseInfo });
  const parsed = parseWorkflow(combined.content);

  assert.equal(combined.filename, 'pipeline.yml');
  assert(parsed.jobs.ci_lint);
  assert(parsed.jobs.deploy_deploy);
  assert(parsed.jobs.security_security);
  assert(parsed.jobs.release_release);
});

test('combineWorkflows preserves workflow-specific trigger scoping in the unified pipeline', () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'combined-trigger-app',
      version: '1.0.0',
      scripts: {
        test: 'echo ok',
        build: 'echo build',
        release: 'echo release',
      },
    }),
  });

  const config = makeJsProject({
    hosting: [{ name: 'Vercel', secrets: ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'] }],
    frameworks: [{ name: 'Next.js', confidence: 1, buildDir: '.next' }],
    testing: [{ name: 'Vitest', type: 'unit', confidence: 1, command: 'npm run test' }],
  });
  config.releaseInfo = { tool: 'custom', command: 'npm run release', publishToNpm: false, requiresNpmToken: false };

  const workflows = new WorkflowGenerator(config, projectDir).generate();
  workflows.push(new ReleaseGenerator(config.releaseInfo, config, projectDir).generate());

  const combined = parseWorkflow(combineWorkflows(workflows, { config, releaseInfo: config.releaseInfo }).content);

  assert.deepEqual(combined.on.push.branches, ['main', 'master', 'develop']);
  assert(combined.jobs.ci_lint.if.includes("github.event_name == 'push'"));
  assert(combined.jobs.ci_lint.if.includes("github.event_name == 'pull_request'"));
  assert(!combined.jobs.ci_lint.if.includes("github.event_name == 'schedule'"));
  assert(combined.jobs.security_security.if.includes("github.event_name == 'schedule'"));
  assert(combined.jobs.deploy_deploy.if.includes("github.ref_name == 'main'"));
  assert(combined.jobs.deploy_deploy.if.includes("github.ref_name == 'master'"));
  assert(!combined.jobs.deploy_deploy.if.includes("github.ref_name == 'develop'"));
});

test('Single-layout monorepos still generate the root workspace matrix CI', () => {
  const projectDir = makeTempDir();
  const packages = [
    {
      name: 'app',
      relativePath: 'packages/app',
      packageJson: {
        name: 'app',
        scripts: {
          lint: 'echo lint',
          test: 'echo test',
          build: 'echo build',
        },
      },
    },
  ];

  const generator = new WorkflowGenerator(
    makeJsProject({
      frameworks: [{ name: 'React', confidence: 1, buildDir: 'dist' }],
      testing: [{ name: 'Vitest', type: 'unit', confidence: 1, command: 'npm run test' }],
      monorepoPackages: packages,
      _config: { monorepo: { perPackage: true } },
    }),
    projectDir
  );

  const ciWorkflow = parseWorkflow(generator.generate().find((workflow) => workflow.filename === 'ci.yml').content);

  assert(ciWorkflow.jobs.ci);
  assert(ciWorkflow.jobs.ci.strategy);
  assert.equal(ciWorkflow.jobs.ci.steps.find((step) => step.name === 'Lint').if, '${{ matrix.lintScript != \'\' }}');
});

test('Frontend Lighthouse is omitted when no build job exists', () => {
  const projectDir = makeTempDir();
  const generator = new WorkflowGenerator(
    makeJsProject({
      frameworks: [{ name: 'React', confidence: 1 }],
    }),
    projectDir
  );

  const parsed = parseWorkflow(generator._buildCIWorkflow());

  assert(!parsed.jobs.lighthouse);
});

test('E2E jobs fall back to existing jobs instead of depending on a missing build job', () => {
  const projectDir = makeTempDir();
  const generator = new WorkflowGenerator(
    makeJsProject({
      testing: [{ name: 'Cypress', type: 'e2e', confidence: 1, command: 'npx cypress run' }],
    }),
    projectDir
  );

  const parsed = parseWorkflow(generator._buildCIWorkflow());

  assert.deepEqual(parsed.jobs.e2e.needs, ['lint']);
});

test('Deploy workflow keeps develop when it is the only configured branch', () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'develop-only-app',
      version: '1.0.0',
    }),
  });

  const generator = new WorkflowGenerator(
    makeJsProject({
      hosting: [{ name: 'Vercel', secrets: ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'] }],
      _config: { branches: ['develop'] },
    }),
    projectDir
  );

  const deploy = generator.generate().find((workflow) => workflow.filename === 'deploy.yml');
  const parsed = parseWorkflow(deploy.content);

  assert.deepEqual(parsed.on.push.branches, ['develop']);
});

test('Netlify preview configuration uses the detected production branch instead of hardcoding main', () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'netlify-app',
      version: '1.0.0',
      scripts: {
        build: 'echo build',
      },
    }),
  });

  const generator = new WorkflowGenerator(
    makeJsProject({
      hosting: [{ name: 'Netlify', secrets: ['NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID'] }],
      defaultBranch: 'release',
    }),
    projectDir
  );

  const deploy = generator.generate().find((workflow) => workflow.filename === 'deploy.yml');
  const parsed = parseWorkflow(deploy.content);
  const previewStep = parsed.jobs.preview.steps.find(
    (step) => step.name === 'Deploy Preview' && step.uses === 'nwtgck/actions-netlify@v3.0'
  );

  assert.equal(previewStep.with['production-branch'], 'release');
});

test('Generic JavaScript builds no longer upload a fake dist artifact when no build directory is known', () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'generic-build-app',
      version: '1.0.0',
      scripts: {
        build: 'node -e "console.log(\'build\')"',
      },
    }),
  });

  const generator = new WorkflowGenerator(
    makeJsProject({
      frameworks: [{ name: 'React', confidence: 1 }],
    }),
    projectDir
  );

  const workflow = parseWorkflow(generator._buildCIWorkflow());
  const stepNames = workflow.jobs.build.steps.map((step) => step.name);

  assert(stepNames.includes('Build'));
  assert(!stepNames.includes('Upload build artifact'));
});

test('JavaScript workflows without a package lock file use npm install instead of npm ci', () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'no-lock-app',
      version: '1.0.0',
      scripts: {
        build: 'echo build',
      },
    }),
  });

  const generator = new WorkflowGenerator(makeJsProject(), projectDir);
  const workflow = parseWorkflow(generator._buildCIWorkflow());
  const installStep = workflow.jobs.lint.steps.find((step) => step.name === 'Install dependencies');

  assert.equal(installStep.run, 'npm install');
});

test('Bun workflows set up Bun before installing dependencies', () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'bun-app',
      version: '1.0.0',
      scripts: {
        lint: 'bun lint',
        build: 'bun run build',
      },
    }),
  });

  const generator = new WorkflowGenerator(
    makeJsProject({
      languages: [{ name: 'JavaScript', packageManager: 'bun', nodeVersion: '20' }],
      hosting: [{ name: 'Netlify', secrets: ['NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID'] }],
    }),
    projectDir
  );

  const workflow = parseWorkflow(generator._buildCIWorkflow());
  const setupStepNames = workflow.jobs.lint.steps.map((step) => step.name);
  const installStep = workflow.jobs.lint.steps.find((step) => step.name === 'Install dependencies');
  const lintStep = workflow.jobs.lint.steps.find((step) => step.name === 'Lint');
  const buildStep = workflow.jobs.build.steps.find((step) => step.name === 'Build');
  const deploy = parseWorkflow(generator.generate().find((entry) => entry.filename === 'deploy.yml').content);
  const deployBuildStep = deploy.jobs.deploy.steps.find((step) => step.name === 'Build');

  assert(setupStepNames.includes('Set up Bun'));
  assert.equal(installStep.run, 'bun install');
  assert.equal(lintStep.run, 'bun run lint');
  assert.equal(buildStep.run, 'bun run build');
  assert.equal(deployBuildStep.run, 'bun run build');
});

test('Python security workflow honors the detected Python version', () => {
  const projectDir = makeTempDir();
  const generator = new WorkflowGenerator(
    {
      hosting: [],
      frameworks: [],
      languages: [{ name: 'Python', packageManager: 'pip', pythonVersion: '3.12' }],
      testing: [],
      envVars: { secrets: [], public: [], all: [], sourceFile: null },
      monorepoPackages: [],
      lockFiles: [],
      _config: {},
    },
    projectDir
  );

  const workflow = parseWorkflow(generator._buildSecurityWorkflow());
  const pythonSetup = workflow.jobs.security.steps.find((step) => step.name === 'Set up Python');

  assert.equal(pythonSetup.with['python-version'], '3.12');
});

test('smartMergeWorkflow preserves existing custom steps that cistack does not regenerate', () => {
  const existing = [
    'name: CI',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Checkout code',
    '        uses: actions/checkout@v4',
    '      - name: Custom',
    '        run: echo custom',
    '',
  ].join('\n');

  const generated = [
    '# Generated by cistack',
    '',
    'name: CI',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Checkout code',
    '        uses: actions/checkout@v4',
    '      - name: Build',
    '        run: npm run build',
    '',
  ].join('\n');

  const result = smartMergeWorkflow(existing, generated);
  const merged = yaml.load(stripHeader(result.content));
  const stepNames = merged.jobs.build.steps.map((step) => step.name);

  assert(stepNames.includes('Custom'));
  assert(stepNames.includes('Build'));
});

test('Per-package CI picks workspace build scripts instead of only reading the root package.json', () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'monorepo-root',
      private: true,
      workspaces: ['packages/*'],
      scripts: {
        test: 'echo root',
      },
    }),
    'packages/pkg-a/package.json': json({
      name: 'pkg-a',
      version: '1.0.0',
      scripts: {
        lint: 'echo lint',
        test: 'echo test',
        build: 'echo build',
      },
    }),
  });

  const pkg = {
    name: 'pkg-a',
    relativePath: 'packages/pkg-a',
    packageJson: JSON.parse(fs.readFileSync(path.join(projectDir, 'packages/pkg-a/package.json'), 'utf8')),
  };

  const generator = new WorkflowGenerator(
    makeJsProject({
      testing: [{ name: 'Vitest', type: 'unit', confidence: 1, command: 'npm run test' }],
      monorepoPackages: [pkg],
      _config: { workflowLayout: 'split', monorepo: { perPackage: true } },
    }),
    projectDir
  );

  const ciWorkflow = generator.generate().find((workflow) => workflow.filename === 'ci-pkg-a.yml');
  const parsed = parseWorkflow(ciWorkflow.content);
  const lintStep = parsed.jobs.lint.steps.find((step) => step.name === 'Lint');
  const testStep = parsed.jobs.test.steps.find((step) => step.name === 'Run tests');
  const buildStep = parsed.jobs.build.steps.find((step) => step.name === 'Build');

  assert.equal(lintStep.run, 'npm run lint --workspace=pkg-a');
  assert.equal(testStep.run, 'npm run test --workspace=pkg-a');
  assert.equal(buildStep.run, 'npm run build --workspace=pkg-a');
});

test('Monorepo root CI installs dependencies at the repo root and does not hide workspace failures', () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'workspace-root',
      private: true,
      workspaces: ['packages/*'],
    }),
    'yarn.lock': '',
    'packages/app/package.json': json({
      name: 'app',
      version: '1.0.0',
      scripts: {
        lint: 'echo lint',
        test: 'echo test',
        build: 'echo build',
      },
    }),
    'packages/docs/package.json': json({
      name: 'docs',
      version: '1.0.0',
    }),
  });

  const packages = [
    {
      name: 'app',
      relativePath: 'packages/app',
      packageJson: JSON.parse(fs.readFileSync(path.join(projectDir, 'packages/app/package.json'), 'utf8')),
    },
    {
      name: 'docs',
      relativePath: 'packages/docs',
      packageJson: JSON.parse(fs.readFileSync(path.join(projectDir, 'packages/docs/package.json'), 'utf8')),
    },
  ];

  const generator = new WorkflowGenerator(
    makeJsProject({
      frameworks: [{ name: 'React', confidence: 1, buildDir: 'dist' }],
      languages: [{ name: 'JavaScript', packageManager: 'yarn', nodeVersion: '20' }],
      monorepoPackages: packages,
      lockFiles: ['yarn.lock'],
      _config: { workflowLayout: 'split', monorepo: { perPackage: true } },
    }),
    projectDir
  );

  const rootWorkflow = parseWorkflow(generator.generate().find((workflow) => workflow.filename === 'ci.yml').content);
  const ciSteps = rootWorkflow.jobs.ci.steps;
  const installStep = ciSteps.find((step) => step.name === 'Install dependencies');
  const lintStep = ciSteps.find((step) => step.name === 'Lint');
  const testStep = ciSteps.find((step) => step.name === 'Test');
  const buildStep = ciSteps.find((step) => step.name === 'Build');
  const lighthouseBuildStep = rootWorkflow.jobs.lighthouse.steps.find((step) => step.name === 'Build workspace');

  assert.equal(installStep.run, 'yarn install --frozen-lockfile');
  assert.equal(lintStep.if, '${{ matrix.lintScript != \'\' }}');
  assert.equal(testStep.if, '${{ matrix.testScript != \'\' }}');
  assert.equal(buildStep.if, '${{ matrix.buildScript != \'\' }}');
  assert(!lintStep.run.includes('|| true'));
  assert(!testStep.run.includes('|| true'));
  assert(!buildStep.run.includes('|| true'));
  assert.equal(lighthouseBuildStep.run, 'yarn workspace ${{ matrix.name }} run ${{ matrix.buildScript }}');
});

test('Bun monorepo matrix commands are scoped to the workspace path', () => {
  const projectDir = makeTempDir();
  const packages = [
    {
      name: 'pkg-a',
      relativePath: 'packages/pkg-a',
      packageJson: {
        name: 'pkg-a',
        scripts: {
          lint: 'bun lint',
          test: 'bun test',
          build: 'bun run build',
        },
      },
    },
  ];

  const generator = new WorkflowGenerator(
    makeJsProject({
      frameworks: [{ name: 'React', confidence: 1, buildDir: 'dist' }],
      languages: [{ name: 'JavaScript', packageManager: 'bun', nodeVersion: '20' }],
      monorepoPackages: packages,
      _config: { workflowLayout: 'split', monorepo: { perPackage: true } },
    }),
    projectDir
  );

  const parsed = parseWorkflow(generator.generate().find((workflow) => workflow.filename === 'ci.yml').content);
  const lintStep = parsed.jobs.ci.steps.find((step) => step.name === 'Lint');
  const testStep = parsed.jobs.ci.steps.find((step) => step.name === 'Test');
  const buildStep = parsed.jobs.ci.steps.find((step) => step.name === 'Build');

  assert.equal(lintStep.run, "bun run --filter './${{ matrix.package }}' ${{ matrix.lintScript }}");
  assert.equal(testStep.run, "bun run --filter './${{ matrix.package }}' ${{ matrix.testScript }}");
  assert.equal(buildStep.run, "bun run --filter './${{ matrix.package }}' ${{ matrix.buildScript }}");
});

test('ReleaseGenerator respects package manager and default branch for custom release flows', () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'release-generator-fixture',
      version: '1.0.0',
      scripts: {
        release: 'echo release',
      },
    }),
  });

  const generator = new ReleaseGenerator(
    { tool: 'custom', command: null, publishToNpm: false },
    makeJsProject({
      languages: [{ name: 'JavaScript', packageManager: 'pnpm', nodeVersion: '20' }],
      defaultBranch: 'release',
    }),
    projectDir
  );

  const parsed = parseWorkflow(generator.generate().content);
  const releaseStep = parsed.jobs.release.steps.find((step) => step.run === 'pnpm run release');

  assert.deepEqual(parsed.on.push.branches, ['release']);
  assert.equal(releaseStep.run, 'pnpm run release');
});

test('ReleaseGenerator sets up Bun for bun-based release flows', () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'bun-release',
      version: '1.0.0',
      scripts: {
        release: 'echo release',
      },
    }),
  });

  const generator = new ReleaseGenerator(
    { tool: 'custom', command: null, publishToNpm: false },
    {
      hosting: [],
      frameworks: [],
      languages: [{ name: 'JavaScript', packageManager: 'bun', nodeVersion: '20' }],
      testing: [],
      envVars: { secrets: [], public: [], all: [], sourceFile: null },
      monorepoPackages: [],
      lockFiles: [],
      _config: {},
    },
    projectDir
  );

  const parsed = parseWorkflow(generator.generate().content);
  const stepNames = parsed.jobs.release.steps.map((step) => step.name);
  const installStep = parsed.jobs.release.steps.find((step) => step.name === 'Install dependencies');

  assert(stepNames.includes('Set up Bun'));
  assert.equal(installStep.run, 'bun install');
});

test('CLI smoke test still generates workflows in dry-run mode', () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'cli-smoke-app',
      version: '1.0.0',
      scripts: {
        test: 'echo ok',
      },
    }),
  });

  const output = execFileSync(process.execPath, ['bin/ciflow.js', 'generate', '--path', projectDir, '--dry-run', '--no-prompt'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert(output.includes('.github/workflows/pipeline.yml'));
  assert(output.includes('.github/dependabot.yml'));
  assert(output.includes('Unified Pipeline'));
  assert(output.includes('Done! Your GitHub Actions pipeline is ready.'));
});

test('CLI write output shows the pipeline file path in single-layout mode', () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'cli-write-app',
      version: '1.0.0',
      scripts: {
        test: 'echo ok',
      },
    }),
  });

  const output = execFileSync(process.execPath, ['bin/ciflow.js', 'generate', '--path', projectDir, '--no-prompt'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert(output.includes('✔ Written:      .github/workflows/pipeline.yml'));
  assert(output.includes(`Pipeline → ${path.join(projectDir, '.github', 'workflows', 'pipeline.yml')}`));
  assert(output.includes(`Dependabot → ${path.join(projectDir, '.github', 'dependabot.yml')}`));
});

test('CLI supports opting back into split workflow files', () => {
  const projectDir = makeTempDir();
  writeFiles(projectDir, {
    'package.json': json({
      name: 'cli-split-app',
      version: '1.0.0',
      scripts: {
        test: 'echo ok',
      },
    }),
    'cistack.config.js': `module.exports = { workflowLayout: 'split' };\n`,
  });

  const output = execFileSync(process.execPath, ['bin/ciflow.js', 'generate', '--path', projectDir, '--dry-run', '--no-prompt'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert(output.includes('.github/workflows/ci.yml'));
  assert(output.includes('.github/workflows/security.yml'));
  assert(output.includes('Done! Your GitHub Actions pipeline is ready.'));
});

async function main() {
  let passed = 0;

  try {
    for (const { name, fn } of tests) {
      await fn();
      passed++;
      console.log(`ok - ${name}`);
    }

    console.log(`\n${passed} tests passed`);
  } finally {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(`not ok - ${error.message}`);
  if (error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
