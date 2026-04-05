'use strict';

const fs = require('fs');
const path = require('path');
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
    };

    // ── gather all file paths (ignore node_modules, .git, dist, build) ────
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
        '*.min.js',
        '*.min.css',
      ],
      nodir: true,
      dot: true,
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
      'vite.config.ts',
      'webpack.config.js',
      'webpack.config.ts',
      'rollup.config.js',
      'turbo.json',
      'nx.json',
      'lerna.json',
      'rush.json',
      // Test
      'jest.config.js',
      'jest.config.ts',
      'vitest.config.js',
      'vitest.config.ts',
      'cypress.config.js',
      'cypress.config.ts',
      'playwright.config.js',
      'playwright.config.ts',
      '.mocharc.js',
      '.mocharc.yml',
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
      'circle.ci/config.yml',
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
      (info.packageJson &&
        (info.packageJson.workspaces ||
          info.packageJson.private === true));

    info.hasMonorepo = !!hasMonorepoMarker;
    if (info.packageJson && info.packageJson.workspaces) {
      const ws = info.packageJson.workspaces;
      info.workspaces = Array.isArray(ws) ? ws : ws.packages || [];
    }

    return info;
  }
}

module.exports = CodebaseAnalyzer;
