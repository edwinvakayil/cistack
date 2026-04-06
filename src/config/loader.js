'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Loads cistack.config.js (or .cjs / .mjs) from the project root.
 * Returns an empty object if no config file is found.
 *
 * Supported keys:
 *   nodeVersion      – override detected Node version e.g. '18'
 *   packageManager   – override detected PM: 'npm'|'yarn'|'pnpm'|'bun'
 *   hosting          – array of hosting names to force e.g. ['Firebase']
 *   branches         – branches to run CI on e.g. ['main', 'staging']
 *   cache            – { npm: bool, cargo: bool, pip: bool, ... } enable/disable caches
 *   monorepo         – { perPackage: bool } generate one file per workspace
 *   release          – { tool: 'semantic-release'|'changesets'|'standard-version'|'release-it' }
 *   secrets          – extra secret names to document in workflow comments
 *   outputDir        – override default '.github/workflows'
 */
class ConfigLoader {
  constructor(projectPath) {
    this.projectPath = projectPath;
  }

  load() {
    const candidates = [
      'cistack.config.js',
      'cistack.config.cjs',
      'cistack.config.mjs',
    ];

    for (const candidate of candidates) {
      const fullPath = path.join(this.projectPath, candidate);
      if (fs.existsSync(fullPath)) {
        try {
          // For .js and .cjs, we can use require (with cache clearing)
          // For .mjs, we might need a different approach, but sticking to sync require for now where possible
          // In a real CLI, we might use dynamic import() but that's async.
          // Since this is a CLI, we can afford a bit of hackiness or just support CommonJS primarily.
          
          let cfg;
          if (candidate.endsWith('.mjs')) {
            // Very basic support for .mjs if the environment supports it, but require usually fails.
            // We'll try to use the fact that many environments now support require('.mjs') or just warn.
            cfg = require(fullPath);
          } else {
            delete require.cache[require.resolve(fullPath)];
            cfg = require(fullPath);
          }

          // Handle both `module.exports = {}` and `export default {}`
          const resolved = cfg && cfg.__esModule ? cfg.default : cfg;
          if (resolved && typeof resolved === 'object') {
            return resolved;
          }
        } catch (err) {
          // If it fails, it might be because it's ESM. 
          // We don't want to crash, but we should inform the user if they have a config but it's broken.
          console.warn(chalk.yellow(`[cistack] Warning: could not load ${candidate}: ${err.message}`));
          if (err.message.includes('ERR_REQUIRE_ESM')) {
            console.warn(chalk.dim(`  Tip: Try renaming ${candidate} to ${candidate.replace('.js', '.cjs')} or use CommonJS syntax.`));
          }
        }
      }
    }

    return {};
  }

  /**
   * Deep-merge config file settings into detected settings.
   * Config file always wins on scalar values; arrays overwrite entirely.
   */
  static merge(detected, override) {
    if (!override || typeof override !== 'object') return detected;

    const result = { ...detected };

    for (const [key, val] of Object.entries(override)) {
      if (val === null || val === undefined) continue;

      if (Array.isArray(val)) {
        result[key] = val; // arrays overwrite
      } else if (typeof val === 'object' && !Array.isArray(detected[key])) {
        result[key] = { ...(detected[key] || {}), ...val };
      } else {
        result[key] = val;
      }
    }

    return result;
  }

  /**
   * Apply config file overrides onto the full detected stack.
   *
   * @param {object} cfg          - raw cistack.config.js export
   * @param {object} detected     - { hosting, frameworks, languages, testing, ... }
   * @returns {object}            - merged config ready for the generator
   */
  static applyToStack(cfg, detected) {
    if (!cfg || Object.keys(cfg).length === 0) return detected;

    const result = { ...detected };

    // 1. Language overrides (Node version, package manager)
    if (cfg.nodeVersion && result.languages && result.languages.length > 0) {
      result.languages = result.languages.map((l, i) =>
        i === 0 && (l.name === 'JavaScript' || l.name === 'TypeScript')
          ? { ...l, nodeVersion: String(cfg.nodeVersion), manual: true }
          : l
      );
    }

    if (cfg.packageManager && result.languages && result.languages.length > 0) {
      result.languages = result.languages.map((l, i) =>
        i === 0 ? { ...l, packageManager: cfg.packageManager, manual: true } : l
      );
    }

    // 2. Hosting overrides
    if (cfg.hosting) {
      const hostingNames = Array.isArray(cfg.hosting) ? cfg.hosting : [cfg.hosting];
      result.hosting = hostingNames.map((name) => ({
        name,
        confidence: 1.0,
        manual: true,
        secrets: [],
        notes: ['set via cistack.config.js'],
      }));
    }

    // 3. Framework overrides
    if (cfg.frameworks) {
      const frameworkNames = Array.isArray(cfg.frameworks) ? cfg.frameworks : [cfg.frameworks];
      result.frameworks = frameworkNames.map(name => ({
        name,
        confidence: 1.0,
        manual: true
      }));
    }

    // 4. Testing overrides
    if (cfg.testing) {
      const testNames = Array.isArray(cfg.testing) ? cfg.testing : [cfg.testing];
      result.testing = testNames.map(name => ({
        name,
        confidence: 1.0,
        manual: true,
        type: 'unit', // default
        command: `npm run test` // fallback
      }));
    }

    // Pass through raw extras for generators to consume
    result._config = { ...(result._config || {}), ...cfg };

    return result;
  }
}

module.exports = ConfigLoader;
