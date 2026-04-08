'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { globSync } = require('glob');

/**
 * Scans the project root and collects all the raw signals that detectors need.
 */
class CodebaseAnalyzer {
  constructor(projectPath, options = {}) {
    this.root = projectPath;
    this.verbose = options.verbose || false;
  }

  async analyse() {
    const info = {
      root: this.root,
      files: [],
      packageJson: null,
      lockFiles: [],
      configFiles: [],
      dockerFiles: [],
      envFiles: [],
      srcStructure: {},
      hasMonorepo: false,
      workspaces: [],
      defaultBranch: null,
      currentBranch: null,
    };

    // ── gather notable file paths (avoid giant deep scans) ──────────────
    const allFiles = globSync('**/*', {
      cwd: this.root,
      ignore: [
        'node_modules/**',
        '.git/**',
        'dist/**',
        'build/**',
        '.next/**',
        '.nuxt/**',
        'coverage/**',
        'public/**',
        'assets/**',
        'static/**',
        'vendor/**',
        '*.min.js',
        '*.min.css',
      ],
      nodir: false,
      dot: true,
      maxDepth: 5, // Avoid extreme depth for general discovery
    });

    info.files = allFiles;

    // ── parse package.json ────────────────────────────────────────────────
    const pkgPath = path.join(this.root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        info.packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      } catch (_) {}
    }

    // ── detect lock files ─────────────────────────────────────────────────
    const lockCandidates = [
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'bun.lock',
      'bun.lockb',
      'Pipfile.lock',
      'poetry.lock',
      'Gemfile.lock',
      'go.sum',
      'Cargo.lock',
      'composer.lock',
    ];
    info.lockFiles = lockCandidates.filter((f) =>
      fs.existsSync(path.join(this.root, f))
    );

    // ── detect notable config files ───────────────────────────────────────
    const configCandidates = [
      // Hosting
      'firebase.json',
      '.firebaserc',
      'vercel.json',
      '.vercel',
      'netlify.toml',
      '_redirects',
      'render.yaml',
      'railway.json',
      'railway.toml',
      'heroku.yml',
      'Procfile',
      'app.yaml',           // GCP App Engine
      'serverless.yml',
      'serverless.yaml',
      'amplify.yml',
      'appspec.yml',        // AWS CodeDeploy
      // Docker
      'Dockerfile',
      'Dockerfile.prod',
      'docker-compose.yml',
      'docker-compose.yaml',
      '.dockerignore',
      // IaC
      'terraform.tf',
      'main.tf',
      'pulumi.yaml',
      'cdk.json',
      // Lang-specific
      'go.mod',
      'Cargo.toml',
      'pyproject.toml',
      'setup.py',
      'setup.cfg',
      'Pipfile',
      'requirements.txt',
      'Gemfile',
      'pom.xml',
      'build.gradle',
      'build.gradle.kts',
      'settings.gradle',
      'composer.json',
      // Build tools
      'vite.config.js',
      'vite.config.cjs',
      'vite.config.mjs',
      'vite.config.ts',
      'vite.config.cts',
      'vite.config.mts',
      'webpack.config.js',
      'webpack.config.cjs',
      'webpack.config.mjs',
      'webpack.config.ts',
      'webpack.config.cts',
      'webpack.config.mts',
      'rollup.config.js',
      'rollup.config.cjs',
      'rollup.config.mjs',
      'rollup.config.ts',
      'rollup.config.cts',
      'rollup.config.mts',
      'next.config.js',
      'next.config.cjs',
      'next.config.mjs',
      'next.config.ts',
      'next.config.cts',
      'next.config.mts',
      'nuxt.config.js',
      'nuxt.config.cjs',
      'nuxt.config.mjs',
      'nuxt.config.ts',
      'nuxt.config.cts',
      'nuxt.config.mts',
      'svelte.config.js',
      'svelte.config.cjs',
      'svelte.config.mjs',
      'svelte.config.ts',
      'svelte.config.cts',
      'svelte.config.mts',
      'astro.config.js',
      'astro.config.cjs',
      'turbo.json',
      'nx.json',
      'lerna.json',
      'rush.json',
      // Test
      'jest.config.js',
      'jest.config.cjs',
      'jest.config.mjs',
      'jest.config.ts',
      'jest.config.cts',
      'jest.config.mts',
      'vitest.config.js',
      'vitest.config.cjs',
      'vitest.config.mjs',
      'vitest.config.ts',
      'vitest.config.cts',
      'vitest.config.mts',
      'cypress.config.js',
      'cypress.config.cjs',
      'cypress.config.mjs',
      'cypress.config.ts',
      'cypress.config.cts',
      'cypress.config.mts',
      'playwright.config.js',
      'playwright.config.cjs',
      'playwright.config.mjs',
      'playwright.config.ts',
      'playwright.config.cts',
      'playwright.config.mts',
      '.mocharc.js',
      '.mocharc.cjs',
      '.mocharc.mjs',
      '.mocharc.yml',
      '.mocharc.yaml',
      '.mocharc.json',
      'phpunit.xml',
      'pytest.ini',
      'conftest.py',
      // Lint / Format
      '.eslintrc',
      '.eslintrc.js',
      '.eslintrc.json',
      '.prettierrc',
      '.stylelintrc',
      'biome.json',
      // CI already present
      '.travis.yml',
      '.circleci/config.yml',
      'Jenkinsfile',
    ];

    info.configFiles = configCandidates.filter((f) =>
      fs.existsSync(path.join(this.root, f))
    );

    info.dockerFiles = info.configFiles.filter((f) =>
      f.toLowerCase().includes('docker')
    );

    // ── .env files ────────────────────────────────────────────────────────
    info.envFiles = allFiles.filter((f) => path.basename(f).startsWith('.env'));

    // ── src structure hints ───────────────────────────────────────────────
    const topDirs = fs
      .readdirSync(this.root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter(
        (d) =>
          !['node_modules', '.git', '.github', 'coverage', 'dist', 'build'].includes(d)
      );

    info.srcStructure.topDirs = topDirs;
    info.srcStructure.hasPages =
      topDirs.includes('pages') || topDirs.includes('app');
    info.srcStructure.hasPublic = topDirs.includes('public');
    info.srcStructure.hasSrc = topDirs.includes('src');
    info.srcStructure.hasFunctions =
      topDirs.includes('functions') || topDirs.includes('api');

    // ── monorepo detection ────────────────────────────────────────────────
    const hasMonorepoMarker =
      fs.existsSync(path.join(this.root, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(this.root, 'turbo.json')) ||
      fs.existsSync(path.join(this.root, 'nx.json')) ||
      fs.existsSync(path.join(this.root, 'lerna.json')) ||
      (info.packageJson && info.packageJson.workspaces);

    info.hasMonorepo = !!hasMonorepoMarker;
    if (info.packageJson && info.packageJson.workspaces) {
      const ws = info.packageJson.workspaces;
      info.workspaces = Array.isArray(ws) ? ws : ws.packages || [];
    }

    // ── git branch hints ───────────────────────────────────────────────────
    const gitInfo = this._detectGitBranches();
    info.defaultBranch = gitInfo.defaultBranch;
    info.currentBranch = gitInfo.currentBranch;

    return info;
  }

  _detectGitBranches() {
    const readGit = (args) => {
      try {
        return execFileSync('git', args, {
          cwd: this.root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
      } catch (_) {
        return '';
      }
    };

    const remoteHead = readGit(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
    const currentBranch = readGit(['symbolic-ref', '--quiet', '--short', 'HEAD']) || null;
    const defaultBranch = remoteHead
      ? remoteHead.replace(/^origin\//, '')
      : currentBranch;

    return {
      defaultBranch: defaultBranch || null,
      currentBranch,
    };
  }
}

module.exports = CodebaseAnalyzer;
