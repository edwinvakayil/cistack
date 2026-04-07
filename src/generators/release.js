'use strict';

const yaml = require('js-yaml');

/**
 * Generates a .github/workflows/release.yml tailored to the detected release tool.
 *
 * Supported tools: semantic-release, changesets, release-it, standard-version, custom
 */
class ReleaseGenerator {
  constructor(releaseInfo, config, projectPath) {
    this.release = releaseInfo;       // output from ReleaseDetector
    this.config = config;             // full detected + merged stack config
    this.projectPath = projectPath;
    this.primaryLang = (config.languages && config.languages[0]) || { name: 'JavaScript', packageManager: 'npm', nodeVersion: '20' };
    this.extraConfig = config._config || {}; // raw cistack.config.js
    this.defaultBranch = config.defaultBranch || config.currentBranch || null;
  }

  generate() {
    if (!this.release) return null;

    const tool = this.release.tool;
    const lang = this.primaryLang;
    const pm = lang.packageManager || 'npm';
    const nodeVersion = lang.nodeVersion || '20';

    const runCmd = (script) =>
      pm === 'yarn' ? `yarn run ${script}` : pm === 'pnpm' ? `pnpm run ${script}` : pm === 'bun' ? `bun run ${script}` : `npm run ${script}`;

    const installCmd =
      pm === 'npm'   ? 'npm ci' :
      pm === 'yarn'  ? 'yarn install --frozen-lockfile' :
      pm === 'pnpm'  ? 'pnpm install --frozen-lockfile' :
                       'bun install';

    // ── common setup steps ────────────────────────────────────────────────
    const setupSteps = [
      { name: 'Checkout', uses: 'actions/checkout@v4', with: { 'fetch-depth': 0 } },
    ];

    if (pm === 'pnpm') {
      setupSteps.push({ name: 'Install pnpm', uses: 'pnpm/action-setup@v3', with: { version: 'latest' } });
    }

    setupSteps.push({
      name: 'Set up Node.js',
      uses: 'actions/setup-node@v4',
      with: {
        'node-version': nodeVersion,
        cache: pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : 'npm',
        ...(this.release.publishToNpm ? { 'registry-url': 'https://registry.npmjs.org' } : {}),
      },
    });

    setupSteps.push({ name: 'Install dependencies', run: installCmd });

    // ── tool-specific steps ────────────────────────────────────────────────
    let releaseSteps = [];
    let envVars = {
      GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
    };
    let requiredSecrets = ['GITHUB_TOKEN'];

    switch (tool) {
      case 'semantic-release': {
        if (this.release.requiresNpmToken) {
          envVars['NPM_TOKEN'] = '${{ secrets.NPM_TOKEN }}';
          requiredSecrets.push('NPM_TOKEN');
        }
        releaseSteps.push({
          name: '🚀 Semantic Release',
          run: 'npx semantic-release',
          env: envVars,
        });
        break;
      }

      case 'changesets': {
        envVars['NPM_TOKEN'] = '${{ secrets.NPM_TOKEN }}';
        requiredSecrets.push('NPM_TOKEN');
        releaseSteps.push(
          {
            name: 'Create Release PR or Publish',
            uses: 'changesets/action@v1',
            with: {
              publish: this.release.command || runCmd('release'),
              title: 'chore: version packages',
              commit: 'chore: version packages',
            },
            env: envVars,
          }
        );
        break;
      }

      case 'release-it': {
        if (this.release.publishToNpm) {
          envVars['NPM_TOKEN'] = '${{ secrets.NPM_TOKEN }}';
          requiredSecrets.push('NPM_TOKEN');
        }
        releaseSteps.push({
          name: '🚀 Release It',
          run: 'npx release-it --ci',
          env: envVars,
        });
        break;
      }

      case 'standard-version': {
        releaseSteps.push(
          {
            name: 'Configure Git',
            run: [
              'git config user.email "github-actions[bot]@users.noreply.github.com"',
              'git config user.name "github-actions[bot]"',
            ].join('\n'),
          },
          {
            name: 'Bump version & changelog',
            run: 'npx standard-version',
          },
          {
            name: 'Push release commit & tag',
            run: 'git push --follow-tags origin ${{ github.ref_name }}',
            env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' },
          },
          {
            name: 'Create GitHub Release',
            uses: 'softprops/action-gh-release@v2',
            with: {
              generate_release_notes: true,
            },
            env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' },
          }
        );
        break;
      }

      default: {
        releaseSteps.push({
          name: '🚀 Release',
          run: this.release.command || runCmd('release'),
          env: envVars,
        });
      }
    }

    const secretsDoc = requiredSecrets.filter((s) => s !== 'GITHUB_TOKEN').length > 0
      ? `# Required secrets: ${requiredSecrets.filter((s) => s !== 'GITHUB_TOKEN').join(', ')}\n# Add these at: Settings → Secrets and Variables → Actions\n\n`
      : '';

    const branches = this._resolveBranches(['main', 'master']);

    const workflow = {
      name: 'Release',
      on: {
        push: { branches },
        workflow_dispatch: {},
      },
      permissions: {
        contents: 'write',
        'pull-requests': 'write',
        ...(this.release.publishToNpm ? { packages: 'write' } : {}),
      },
      jobs: {
        release: {
          name: `🏷️ Release (${tool})`,
          'runs-on': 'ubuntu-latest',
          // Only run on the configured branches, not every push in a monorepo etc.
          if: branches.map(b => `github.ref == 'refs/heads/${b}'`).join(' || '),
          steps: [...setupSteps, ...releaseSteps],
        },
      },
    };

    const raw = yaml.dump(workflow, {
      indent: 2,
      lineWidth: 120,
      quotingType: "'",
      forceQuotes: false,
      noRefs: true,
    });

    return {
      filename: 'release.yml',
      content:
        `# Generated by cistack — https://github.com/cistack\n` +
        `# Release Pipeline → ${tool}\n` +
        secretsDoc +
        raw,
    };
  }

  _resolveBranches(fallback) {
    if (Array.isArray(this.extraConfig.branches) && this.extraConfig.branches.length > 0) {
      return [...new Set(this.extraConfig.branches)];
    }
    if (this.defaultBranch) {
      return [this.defaultBranch];
    }
    return fallback;
  }
}

module.exports = ReleaseGenerator;
