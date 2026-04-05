'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Detects the release tooling used in a project.
 *
 * Checks (in order of priority):
 *   1. semantic-release
 *   2. @changesets/cli
 *   3. release-it
 *   4. standard-version
 *
 * Returns: { tool: string, config: object, publishToNpm: bool } or null
 */
class ReleaseDetector {
  constructor(projectPath, codebaseInfo) {
    this.root = projectPath;
    this.info = codebaseInfo;
    this.pkg = codebaseInfo.packageJson || {};
    this.deps = {
      ...(this.pkg.dependencies || {}),
      ...(this.pkg.devDependencies || {}),
    };
    this.scripts = this.pkg.scripts || {};
  }

  async detect() {
    // --- semantic-release ---
    if (this.deps['semantic-release']) {
      const config = this._loadSemanticReleaseConfig();
      const plugins = config.plugins || ['@semantic-release/commit-analyzer', '@semantic-release/release-notes-generator', '@semantic-release/github'];
      return {
        tool: 'semantic-release',
        command: 'npx semantic-release',
        config,
        plugins,
        publishToNpm: plugins.some((p) => (typeof p === 'string' ? p : p[0]) === '@semantic-release/npm'),
        requiresNpmToken: plugins.some((p) => (typeof p === 'string' ? p : p[0]) === '@semantic-release/npm'),
      };
    }

    // --- changesets ---
    if (this.deps['@changesets/cli']) {
      const publishScript = this.scripts['release'] || this.scripts['publish'];
      return {
        tool: 'changesets',
        command: 'npx changeset publish',
        publishToNpm: !!(publishScript && publishScript.includes('publish')),
        requiresNpmToken: true,
      };
    }

    // --- release-it ---
    if (this.deps['release-it']) {
      const config = this._loadReleaseItConfig();
      return {
        tool: 'release-it',
        command: 'npx release-it --ci',
        config,
        publishToNpm: !!(config && config.npm && config.npm.publish !== false),
        requiresNpmToken: true,
      };
    }

    // --- standard-version ---
    if (this.deps['standard-version']) {
      return {
        tool: 'standard-version',
        command: 'npx standard-version',
        publishToNpm: false,
        requiresNpmToken: false,
      };
    }

    // --- fallback: check scripts ---
    const releaseScript = this.scripts['release'] || this.scripts['version'];
    if (releaseScript) {
      return {
        tool: 'custom',
        command: 'npm run release',
        publishToNpm: releaseScript.includes('publish'),
        requiresNpmToken: releaseScript.includes('publish'),
      };
    }

    return null;
  }

  _loadSemanticReleaseConfig() {
    // Try .releaserc, .releaserc.json, .releaserc.js, package.json#release
    const candidates = ['.releaserc', '.releaserc.json', '.releaserc.js', '.releaserc.yaml'];
    for (const c of candidates) {
      const p = path.join(this.root, c);
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf8');
          if (c.endsWith('.js')) return require(p);
          return JSON.parse(raw);
        } catch (_) {}
      }
    }
    if (this.pkg.release) return this.pkg.release;
    return {};
  }

  _loadReleaseItConfig() {
    const candidates = ['.release-it.json', '.release-it.js', '.release-it.yaml'];
    for (const c of candidates) {
      const p = path.join(this.root, c);
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf8');
          return JSON.parse(raw);
        } catch (_) {}
      }
    }
    if (this.pkg['release-it']) return this.pkg['release-it'];
    return {};
  }
}

module.exports = ReleaseDetector;
