'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

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

  async load() {
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
          if (candidate.endsWith('.mjs') || (candidate.endsWith('.js') && !candidate.endsWith('.cjs'))) {
            // Dynamic import() for ESM support
            const modulePath = path.resolve(this.projectPath, candidate);
            const imported = await import(`file://${modulePath}`);
            cfg = imported.default || imported;
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
    const runScript = (scriptName) => {
      const packageManager =
        (result.languages && result.languages[0] && result.languages[0].packageManager) ||
        cfg.packageManager ||
        'npm';
      if (packageManager === 'yarn') return `yarn run ${scriptName}`;
      if (packageManager === 'pnpm') return `pnpm run ${scriptName}`;
      if (packageManager === 'bun') return `bun run ${scriptName}`;
      return `npm run ${scriptName}`;
    };
    const canonicalHostingNames = {
      firebase: 'Firebase',
      vercel: 'Vercel',
      netlify: 'Netlify',
      aws: 'AWS',
      'gcp app engine': 'GCP App Engine',
      gcp: 'GCP App Engine',
      azure: 'Azure',
      heroku: 'Heroku',
      render: 'Render',
      railway: 'Railway',
      'github pages': 'GitHub Pages',
      'github-pages': 'GitHub Pages',
    };

    // 1. Language overrides (Node version, package manager)
    if (cfg.nodeVersion && result.languages && result.languages.length > 0) {
      result.languages = result.languages.map((l, i) =>
        i === 0 && (l.name === 'JavaScript' || l.name === 'TypeScript')
          ? { ...l, nodeVersion: String(cfg.nodeVersion), manual: true }
          : l
      );
    }

    if (cfg.packageManager && result.languages && result.languages.length > 0) {
      result.languages = result.languages.map((l) =>
        ({ ...l, packageManager: cfg.packageManager, manual: true })
      );
    }

    // 2. Hosting overrides
    if (cfg.hosting) {
      const hostingNames = Array.isArray(cfg.hosting) ? cfg.hosting : [cfg.hosting];
      const hostingSecrets = {
        Firebase: ['FIREBASE_SERVICE_ACCOUNT'],
        Vercel: ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'],
        Netlify: ['NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID'],
        AWS: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_S3_BUCKET', 'CLOUDFRONT_DISTRIBUTION_ID'],
        'GCP App Engine': ['GCP_SA_KEY'],
        Azure: ['AZURE_APP_NAME', 'AZURE_WEBAPP_PUBLISH_PROFILE'],
        Heroku: ['HEROKU_API_KEY', 'HEROKU_APP_NAME', 'HEROKU_EMAIL'],
        Render: ['RENDER_DEPLOY_HOOK_URL'],
        Railway: ['RAILWAY_TOKEN'],
        'GitHub Pages': [],
      };
      result.hosting = hostingNames.map((name) => ({
        name: canonicalHostingNames[String(name).toLowerCase()] || name,
        confidence: 1.0,
        manual: true,
        secrets: hostingSecrets[canonicalHostingNames[String(name).toLowerCase()] || name] || [],
        notes: ['set via cistack.config.js'],
      }));
    }

    // 2b. Release override
    if (cfg.release) {
       // If release is provided as a string, wrap it
       result.releaseInfo = typeof cfg.release === 'string' ? { tool: cfg.release } : cfg.release;
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
        command: runScript('test') // fallback
      }));
    }

    // Pass through raw extras for generators to consume
    result._config = { ...(result._config || {}), ...cfg };

    return result;
  }
}

module.exports = ConfigLoader;
