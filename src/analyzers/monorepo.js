'use strict';

const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');

/**
 * Resolves workspace packages from monorepo config files.
 *
 * Supported:
 *   - package.json#workspaces (npm/yarn workspaces array or { packages: [] })
 *   - pnpm-workspace.yaml
 *   - turbo.json  (uses package.json workspaces in conjunction)
 *   - nx.json     (discovers apps/* and libs/*)
 *   - lerna.json  (uses lerna packages array)
 *
 * Returns: Array<{ name: string, relativePath: string, absolutePath: string, packageJson: object|null }>
 */
class MonorepoAnalyzer {
  constructor(projectPath, codebaseInfo) {
    this.root = projectPath;
    this.info = codebaseInfo;
    this.pkg = codebaseInfo.packageJson || {};
  }

  async analyze() {
    if (!this.info.hasMonorepo) return [];

    const workspaceGlobs = this._collectWorkspaceGlobs();
    if (workspaceGlobs.length === 0) return [];

    const packages = [];
    const seen = new Set();

    for (const pattern of workspaceGlobs) {
      // Each glob glob like 'packages/*' → expand to actual dirs
      const matches = globSync(pattern, {
        cwd: this.root,
        onlyDirectories: true,
        absolute: false,
        ignore: ['node_modules/**', '**/node_modules/**'],
      });

      for (const relDir of matches) {
        if (seen.has(relDir)) continue;
        seen.add(relDir);

        const absPath = path.join(this.root, relDir);
        const pkgJsonPath = path.join(absPath, 'package.json');
        let pkgJson = null;

        if (fs.existsSync(pkgJsonPath)) {
          try {
            pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
          } catch (_) {}
        }

        const name = (pkgJson && pkgJson.name) || path.basename(relDir);

        packages.push({
          name,
          relativePath: relDir,
          absolutePath: absPath,
          packageJson: pkgJson,
        });
      }
    }

    return packages;
  }

  _collectWorkspaceGlobs() {
    const globs = [];

    // 1. package.json workspaces
    if (this.pkg.workspaces) {
      const ws = this.pkg.workspaces;
      if (Array.isArray(ws)) {
        globs.push(...ws);
      } else if (ws.packages) {
        globs.push(...ws.packages);
      }
    }

    // 2. pnpm-workspace.yaml
    const pnpmWsPath = path.join(this.root, 'pnpm-workspace.yaml');
    if (fs.existsSync(pnpmWsPath)) {
      try {
        const yaml = require('js-yaml');
        const parsed = yaml.load(fs.readFileSync(pnpmWsPath, 'utf8'));
        if (parsed && parsed.packages) {
          globs.push(...parsed.packages);
        }
      } catch (_) {}
    }

    // 3. lerna.json
    const lernaPath = path.join(this.root, 'lerna.json');
    if (fs.existsSync(lernaPath)) {
      try {
        const lerna = JSON.parse(fs.readFileSync(lernaPath, 'utf8'));
        if (lerna.packages) globs.push(...lerna.packages);
      } catch (_) {}
    }

    // 4. nx.json — default convention: apps/* + libs/*
    const nxPath = path.join(this.root, 'nx.json');
    if (fs.existsSync(nxPath) && globs.length === 0) {
      globs.push('apps/*', 'libs/*', 'packages/*');
    }

    // 5. turbo.json — uses root package.json workspaces (already handled above)
    // If none found yet, use convention
    const turboPath = path.join(this.root, 'turbo.json');
    if (fs.existsSync(turboPath) && globs.length === 0) {
      globs.push('apps/*', 'packages/*');
    }

    // Deduplicate
    return [...new Set(globs)];
  }
}

module.exports = MonorepoAnalyzer;
