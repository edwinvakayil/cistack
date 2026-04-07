'use strict';

const yaml = require('js-yaml');

/**
 * Generates a .github/dependabot.yml based on detected ecosystems.
 *
 * Supported ecosystems:
 *   bun, npm, pip, cargo, bundler, go, maven, gradle, github-actions, composer, docker
 */
class DependabotGenerator {
  constructor(codebaseInfo) {
    this.info = codebaseInfo;
    this.pkg = codebaseInfo.packageJson || {};
    this.lockFiles = new Set(codebaseInfo.lockFiles || []);
    this.configFiles = new Set(codebaseInfo.configFiles || []);
  }

  generate() {
    const updates = [];
    const hasDeps =
      Object.keys(this.pkg.dependencies || {}).length > 0 ||
      Object.keys(this.pkg.devDependencies || {}).length > 0;
    const hasBunLock = this.lockFiles.has('bun.lock');

    // ── bun ────────────────────────────────────────────────────────────────
    if (hasBunLock) {
      updates.push({
        'package-ecosystem': 'bun',
        directory: '/',
        schedule: { interval: 'weekly', day: 'monday' },
        'open-pull-requests-limit': 10,
        groups: {
          'dev-dependencies': {
            'dependency-type': 'development',
            'update-types': ['minor', 'patch'],
          },
        },
      });
    }

    // ── npm ────────────────────────────────────────────────────────────────
    if (!hasBunLock && (hasDeps ||
        this.lockFiles.has('package-lock.json') ||
        this.lockFiles.has('yarn.lock') ||
        this.lockFiles.has('pnpm-lock.yaml'))) {
      updates.push({
        'package-ecosystem': 'npm',
        directory: '/',
        schedule: { interval: 'weekly', day: 'monday' },
        'open-pull-requests-limit': 10,
        groups: {
          'dev-dependencies': {
            'dependency-type': 'development',
            'update-types': ['minor', 'patch'],
          },
        },
      });
    }

    // ── pip ────────────────────────────────────────────────────────────────
    if (this.lockFiles.has('Pipfile.lock') ||
        this.configFiles.has('requirements.txt') ||
        this.configFiles.has('pyproject.toml')) {
      updates.push({
        'package-ecosystem': 'pip',
        directory: '/',
        schedule: { interval: 'weekly', day: 'monday' },
        'open-pull-requests-limit': 10,
      });
    }

    // ── cargo ──────────────────────────────────────────────────────────────
    if (this.lockFiles.has('Cargo.lock') || this.configFiles.has('Cargo.toml')) {
      updates.push({
        'package-ecosystem': 'cargo',
        directory: '/',
        schedule: { interval: 'weekly', day: 'monday' },
        'open-pull-requests-limit': 10,
      });
    }

    // ── bundler (Ruby) ─────────────────────────────────────────────────────
    if (this.lockFiles.has('Gemfile.lock') || this.configFiles.has('Gemfile')) {
      updates.push({
        'package-ecosystem': 'bundler',
        directory: '/',
        schedule: { interval: 'weekly', day: 'monday' },
        'open-pull-requests-limit': 10,
      });
    }

    // ── Go modules ─────────────────────────────────────────────────────────
    if (this.lockFiles.has('go.sum') || this.configFiles.has('go.mod')) {
      updates.push({
        'package-ecosystem': 'gomod',
        directory: '/',
        schedule: { interval: 'weekly', day: 'monday' },
        'open-pull-requests-limit': 10,
      });
    }

    // ── Maven ──────────────────────────────────────────────────────────────
    if (this.configFiles.has('pom.xml')) {
      updates.push({
        'package-ecosystem': 'maven',
        directory: '/',
        schedule: { interval: 'weekly', day: 'monday' },
        'open-pull-requests-limit': 10,
      });
    }

    // ── Gradle ─────────────────────────────────────────────────────────────
    if (this.configFiles.has('build.gradle') || this.configFiles.has('build.gradle.kts')) {
      updates.push({
        'package-ecosystem': 'gradle',
        directory: '/',
        schedule: { interval: 'weekly', day: 'monday' },
        'open-pull-requests-limit': 10,
      });
    }

    // ── Composer (PHP) ─────────────────────────────────────────────────────
    if (this.lockFiles.has('composer.lock') || this.configFiles.has('composer.json')) {
      updates.push({
        'package-ecosystem': 'composer',
        directory: '/',
        schedule: { interval: 'weekly', day: 'monday' },
        'open-pull-requests-limit': 10,
      });
    }

    // ── Docker ─────────────────────────────────────────────────────────────
    if (this.configFiles.has('Dockerfile') ||
        this.configFiles.has('Dockerfile.prod') ||
        this.configFiles.has('docker-compose.yml') ||
        this.configFiles.has('docker-compose.yaml')) {
      updates.push({
        'package-ecosystem': 'docker',
        directory: '/',
        schedule: { interval: 'weekly', day: 'monday' },
        'open-pull-requests-limit': 5,
      });
    }

    // ── GitHub Actions ─────────────────────────────────────────────────────
    // Always include — keeps action versions up to date
    updates.push({
      'package-ecosystem': 'github-actions',
      directory: '/',
      schedule: { interval: 'weekly', day: 'monday' },
      'open-pull-requests-limit': 10,
      groups: {
        'github-actions-updates': {
          patterns: ['*'],
        },
      },
    });

    const doc = { version: 2, updates };

    const raw = yaml.dump(doc, {
      indent: 2,
      lineWidth: 120,
      quotingType: "'",
      forceQuotes: false,
      noRefs: true,
    });

    return {
      filename: 'dependabot.yml',
      outputPath: '.github', // written to .github/, not .github/workflows/
      content:
        '# Generated by cistack — https://github.com/cistack\n' +
        '# Dependabot configuration — auto-update dependencies weekly\n\n' +
        raw,
    };
  }
}

module.exports = DependabotGenerator;
