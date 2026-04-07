'use strict';

const yaml = require('js-yaml');
const { version } = require('../../package.json');


/**
 * Takes all detected signals and produces one or more complete GitHub Actions workflow YAML files.
 * v2.0.0 additions:
 *   - Per-language caching (cargo, pip, poetry, m2, gradle, bundler, go, composer)
 *   - Monorepo-aware: wraps jobs in a matrix over workspaces or generates per-package files
 *   - Env var documentation from .env.example detection
 */
class WorkflowGenerator {
  constructor(config, projectPath) {
    this.hosting = config.hosting || [];
    this.frameworks = config.frameworks || [];
    this.languages = config.languages || [];
    this.testing = config.testing || [];
    this.projectPath = projectPath;
    this.envVars = config.envVars || { secrets: [], public: [], all: [], sourceFile: null };
    this.monorepoPackages = config.monorepoPackages || [];
    this.lockFiles = new Set(config.lockFiles || []);
    this.extraConfig = config._config || {}; // raw cistack.config.js
    this.defaultBranch = config.defaultBranch || config.currentBranch || null;
    this.workflowLayout = this.extraConfig.workflowLayout === 'split' ? 'split' : 'single';

    // Convenient accessors
    this.primaryLang = this.languages[0] || { name: 'JavaScript', packageManager: 'npm', nodeVersion: '20' };
    this.unitTests = this.testing.filter((t) => t.type === 'unit' && t.confidence > 0.3);
    this.e2eTests = this.testing.filter((t) => t.type === 'e2e' && t.confidence > 0.3);
    this.hasDocker = this.hosting.some((h) => h.name === 'Docker');
    this.primaryHosting = this.hosting.filter((h) => h.name !== 'Docker')[0] || null;

    // Monorepo mode: always keep the root matrix workflow for monorepos.
    // Split layout may additionally emit one workflow per workspace.
    this.isMonorepo = this.monorepoPackages.length > 0;
    this.perPackageWorkflows = this.workflowLayout === 'split' && this.isMonorepo && (
      (this.extraConfig.monorepo && this.extraConfig.monorepo.perPackage) ||
      this.monorepoPackages.length > 1
    );

    // Initial runtime detection
    this._detectRuntimeVersions();
  }

  _detectRuntimeVersions() {
    const fs = require('fs');
    const path = require('path');

    // 1. Node.js
    if (!this.primaryLang.nodeVersion) {
      const nvmrcPath = path.join(this.projectPath, '.nvmrc');
      if (fs.existsSync(nvmrcPath)) {
        this.primaryLang.nodeVersion = fs.readFileSync(nvmrcPath, 'utf8').trim().replace('v', '');
      } else {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(this.projectPath, 'package.json'), 'utf8'));
          if (pkg.engines && pkg.engines.node) {
            const match = pkg.engines.node.match(/(\d+)/);
            if (match) this.primaryLang.nodeVersion = match[1];
          }
        } catch (_) {}
      }
      this.primaryLang.nodeVersion = this.primaryLang.nodeVersion || '20';
    }

    // 2. Python
    if (this.primaryLang.name === 'Python' && !this.primaryLang.pythonVersion) {
      const pythonVersionPath = path.join(this.projectPath, '.python-version');
      if (fs.existsSync(pythonVersionPath)) {
        this.primaryLang.pythonVersion = fs.readFileSync(pythonVersionPath, 'utf8').trim();
      } else {
        this.primaryLang.pythonVersion = '3.11';
      }
    }
  }

  generate() {
    const workflows = [];

    if (this.isMonorepo) {
      if (this.perPackageWorkflows) {
        // ── Monorepo split mode: one CI file per workspace ───────────────
        for (const pkg of this.monorepoPackages) {
          workflows.push({
            filename: `ci-${this._slugify(pkg.name)}.yml`,
            content: this._buildCIWorkflow(pkg),
          });
        }
      }
      // ── Monorepo root CI file (matrix over all packages) ──────────────
      workflows.push({
        filename: 'ci.yml',
        content: this._buildMonorepoRootCI(),
      });
    } else {
      // ── Standard: single CI workflow ────────────────────────────────────
      workflows.push({
        filename: 'ci.yml',
        content: this._buildCIWorkflow(),
      });
    }

    // ── 2. Deploy / CD workflow ──────────────────────────────────────────
    if (this.primaryHosting) {
      workflows.push({
        filename: 'deploy.yml',
        content: this._buildDeployWorkflow(),
      });
    }

    // ── 3. Docker image build+push ───────────────────────────────────────
    if (this.hasDocker) {
      workflows.push({
        filename: 'docker.yml',
        content: this._buildDockerWorkflow(),
      });
    }

    return workflows;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CI Workflow
  // ══════════════════════════════════════════════════════════════════════════

  _buildCIWorkflow(pkg = null) {
    const lang = this._langForPackage(pkg);
    const jobs = {};

    const branches = this._resolveBranches(['main', 'master', 'develop']);

    // ── lint job ──────────────────────────────────────────────────────────
    jobs.lint = {
      name: '🔍 Lint & Format',
      'runs-on': 'ubuntu-latest',
      steps: [
        this._stepCheckout(),
        ...this._setupSteps(lang),
        this._stepInstallDeps(lang),
        this._stepLint(lang, pkg),
      ].filter(Boolean),
      env: {
        CI: 'true',
        ...this._getPublicEnv(),
      },
    };

    // ── test job ──────────────────────────────────────────────────────────
    if (this.unitTests.length > 0) {
      const testMatrix = this._testMatrix(lang);
      jobs.test = {
        name: '🧪 Unit Tests',
        'runs-on': 'ubuntu-latest',
        ...(testMatrix ? { strategy: testMatrix } : {}),
        steps: [
          this._stepCheckout(),
          ...this._setupSteps(lang, !!testMatrix),
          this._stepInstallDeps(lang),
          ...this._unitTestSteps(lang, pkg),
          this._stepUploadCoverage(),
        ].filter(Boolean),
        env: {
          CI: 'true',
          ...this._getPublicEnv(),
        },
      };
    }

    // ── build job ─────────────────────────────────────────────────────────
    const buildSteps = this._buildSteps(lang, pkg);
    if (buildSteps.length > 0) {
      jobs.build = {
        name: '🏗️ Build',
        'runs-on': 'ubuntu-latest',
        needs: ['lint', ...(jobs.test ? ['test'] : [])],
        steps: [
          this._stepCheckout(),
          ...this._setupSteps(lang),
          this._stepInstallDeps(lang),
          ...buildSteps,
          this._stepUploadArtifact(lang),
        ].filter(Boolean),
        env: {
          NODE_ENV: 'production',
          ...this._getPublicEnv(),
        },
      };
    }

    // ── lighthouse job ──────────────────────────────────────────────────
    if (jobs.build && this.frameworks.some(f => ['Next.js', 'React', 'Vue', 'Svelte', 'Nuxt'].includes(f.name))) {
      jobs.lighthouse = {
        name: '⚡ Lighthouse Audit',
        'runs-on': 'ubuntu-latest',
        needs: ['build'],
        if: "github.event_name == 'pull_request'",
        steps: [
          this._stepCheckout(),
          {
            name: 'Run Lighthouse on build output',
            uses: 'treosh/lighthouse-ci-action@v11',
            with: {
              uploadArtifacts: true,
              temporaryPublicStorage: true,
              configPath: './.lighthouserc.json',
            },
          },
        ],
        'continue-on-error': true,
      };
    }

    // ── e2e job ───────────────────────────────────────────────────────────
    if (this.e2eTests.length > 0) {
      const e2eTest = this.e2eTests[0];
      const e2eNeeds = jobs.build ? ['build'] : ['lint', ...(jobs.test ? ['test'] : [])];
      jobs.e2e = {
        name: '🎭 E2E Tests',
        'runs-on': 'ubuntu-latest',
        needs: e2eNeeds,
        steps: [
          this._stepCheckout(),
          ...this._setupSteps(lang),
          this._stepInstallDeps(lang),
          ...(e2eTest.name === 'Playwright'
            ? [{ name: 'Install Playwright browsers', run: 'npx playwright install --with-deps' }]
            : []),
          { name: `Run ${e2eTest.name}`, run: e2eTest.command },
          {
            name: 'Upload E2E report',
            if: 'always()',
            uses: 'actions/upload-artifact@v4',
            with: {
              name: 'e2e-report',
              path: e2eTest.name === 'Playwright' ? 'playwright-report/' : 'cypress/screenshots/',
              'retention-days': 7,
            },
          },
        ].filter(Boolean),
      };
    }

    const workflow = {
      name: pkg ? `CI — ${pkg.name}` : 'CI',
      on: {
        push: {
          branches,
          ...(pkg ? { paths: [`${pkg.relativePath}/**`] } : {}),
        },
        pull_request: {
          branches,
          ...(pkg ? { paths: [`${pkg.relativePath}/**`] } : {}),
        },
      },
      concurrency: {
        group: '${{ github.workflow }}-${{ github.ref }}',
        'cancel-in-progress': true,
      },
      jobs,
    };

    const envComment = this._envComment();
    const pipelineStages = ['lint'];
    if (jobs.test) pipelineStages.push('test');
    if (jobs.build) pipelineStages.push('build');
    if (jobs.e2e) pipelineStages.push('e2e');
    const header =
      `# Generated by cistack v${version} — https://github.com/cistack\n` +
      `# CI Pipeline: ${pipelineStages.join(' → ')}\n` +
      envComment +
      `\n`;

    return this._toYaml(workflow, header);
  }

  // ── Monorepo root CI (matrix over all workspaces) ────────────────────────
  _buildMonorepoRootCI() {
    const lang = this.primaryLang;
    const branches = this._resolveBranches(['main', 'master', 'develop']);
    const matrixEntries = this.monorepoPackages.map((pkg) => {
      const pkgScripts = (pkg.packageJson && pkg.packageJson.scripts) || {};
      return {
        name: pkg.name,
        package: pkg.relativePath,
        lintScript: this._findScript(['lint', 'lint:ci', 'eslint'], pkg) || '',
        testScript: (pkgScripts['test:ci'] && 'test:ci') || (pkgScripts.test && 'test') || '',
        buildScript: this._findScript(['build', 'build:prod', 'compile'], pkg) || '',
      };
    });
    const buildablePackages = matrixEntries.filter((pkg) => pkg.buildScript);

    const workflow = {
      name: 'CI — Monorepo',
      on: {
        push: { branches },
        pull_request: { branches },
      },
      concurrency: {
        group: '${{ github.workflow }}-${{ github.ref }}',
        'cancel-in-progress': true,
      },
      jobs: {
        ci: {
          name: '🧪 ${{ matrix.package }}',
          'runs-on': 'ubuntu-latest',
          strategy: {
            matrix: {
              include: matrixEntries,
            },
            'fail-fast': false,
          },
          steps: [
            this._stepCheckout(),
            ...this._setupSteps(lang),
            this._stepInstallDeps(lang),
            {
              name: 'Lint',
              if: '${{ matrix.lintScript != \'\' }}',
              run: this._workspaceRunCommand(lang, '${{ matrix.lintScript }}'),
            },
            {
              name: 'Test',
              if: '${{ matrix.testScript != \'\' }}',
              run: this._workspaceRunCommand(lang, '${{ matrix.testScript }}'),
            },
            {
              name: 'Build',
              if: '${{ matrix.buildScript != \'\' }}',
              run: this._workspaceRunCommand(lang, '${{ matrix.buildScript }}'),
            },
          ].filter(Boolean),
          env: {
            NODE_ENV: 'test',
            CI: 'true',
            ...this._getPublicEnv(),
          },
        },
      },
    };

    if (buildablePackages.length > 0 && this.frameworks.some(f => ['Next.js', 'React', 'Vue', 'Svelte', 'Nuxt'].includes(f.name))) {
      workflow.jobs.lighthouse = {
        name: '⚡ Lighthouse (Root)',
        'runs-on': 'ubuntu-latest',
        strategy: {
          matrix: {
            include: buildablePackages,
          },
        },
        steps: [
          this._stepCheckout(),
          ...this._setupSteps(lang),
          {
            ...this._stepInstallDeps(lang),
          },
          {
            name: 'Build workspace',
            run: this._workspaceRunCommand(lang, '${{ matrix.buildScript }}'),
          },
          {
            name: 'Lighthouse',
            uses: 'treosh/lighthouse-ci-action@v11',
            with: {
              uploadArtifacts: true,
              temporaryPublicStorage: true,
            },
          },
        ],
        'continue-on-error': true,
      };
    }

    return this._toYaml(
      workflow,
      `# Generated by cistack v${version} — https://github.com/cistack\n# Monorepo CI — matrix over all workspaces\n\n`
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Deploy Workflow
  // ══════════════════════════════════════════════════════════════════════════

  _buildDeployWorkflow() {
    const h = this.primaryHosting;
    const lang = this.primaryLang;
    const branches = this._resolveBranches(['main', 'master']);
    const productionBranches = branches.filter((b) => b !== 'develop');
    const deployBranches = productionBranches.length > 0 ? productionBranches : branches;
    const isGHPages = h.name === 'GitHub Pages';
    const supportsPreview = ['Firebase', 'Vercel', 'Netlify'].includes(h.name);

    const preDeploySteps = [
      this._stepCheckout(),
      ...this._setupSteps(lang),
      this._stepInstallDeps(lang),
    ].filter(Boolean);

    const primaryDeployBranch = deployBranches[0] || this.defaultBranch || 'main';
    const deploySteps = this._hostingDeploySteps(h, lang, false, primaryDeployBranch); // production
    // Only generate PR preview steps for platforms that natively isolate them
    const previewSteps = supportsPreview ? this._hostingDeploySteps(h, lang, true, primaryDeployBranch) : [];

    // GitHub Pages requires special permissions on the deploy job
    const ghPagesPermissions = isGHPages
      ? { pages: 'write', 'id-token': 'write', contents: 'read' }
      : undefined;

    const jobs = {
      deploy: {
        name: `🚀 Deploy → ${h.name} (Production)`,
        if: "github.event_name == 'push' || github.event_name == 'workflow_dispatch'",
        'runs-on': 'ubuntu-latest',
        environment: isGHPages ? 'github-pages' : 'production',
        ...(ghPagesPermissions ? { permissions: ghPagesPermissions } : {}),
        steps: [...preDeploySteps, ...deploySteps].filter(Boolean),
      },
    };

    // Add preview job if supported
    if (previewSteps.length > 0) {
      jobs.preview = {
        name: `✨ Deploy → ${h.name} (Preview)`,
        if: "github.event_name == 'pull_request'",
        'runs-on': 'ubuntu-latest',
        environment: 'preview',
        steps: [
          ...preDeploySteps,
          ...previewSteps,
          {
            name: 'Comment PR',
            if: 'always()',
            uses: 'actions/github-script@v7',
            with: {
              script: `
                const deploymentUrl = process.env.DEPLOYMENT_URL;
                if (!deploymentUrl) return;
                github.rest.issues.createComment({
                  issue_number: context.issue.number,
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  body: '🚀 **Deployment Preview Ready!**\\n\\n[View Preview](' + deploymentUrl + ')'
                });
              `
            }
          }
        ].filter(Boolean),
      };
    }

    const allSecrets = [
      ...(h.secrets || []),
      ...this.envVars.secrets,
    ];
    const uniqueSecrets = [...new Set(allSecrets)];

    const secretsDoc = uniqueSecrets.length > 0
      ? `# Required secrets: ${uniqueSecrets.join(', ')}\n# Add these at: Settings → Secrets and Variables → Actions\n\n`
      : '';

    const envComment = this._envComment();

    // Only trigger on PR if the platform supports preview deployments
    const onTrigger = supportsPreview
      ? { push: { branches: deployBranches }, pull_request: { branches }, workflow_dispatch: {} }
      : { push: { branches: deployBranches }, workflow_dispatch: {} };

    const workflow = {
      name: `Deploy to ${h.name}`,
      on: onTrigger,
      concurrency: {
        group: '${{ github.workflow }}-${{ github.ref }}',
        'cancel-in-progress': true,
      },
      jobs,
    };

    return this._toYaml(
      workflow,
      `# Generated by cistack v${version}\n# Deploy Pipeline → ${h.name}\n${secretsDoc}${envComment}\n`
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Docker Workflow
  // ══════════════════════════════════════════════════════════════════════════

  _buildDockerWorkflow() {
    const branches = this._resolveBranches(['main', 'master']);
    const workflow = {
      name: 'Docker Build & Push',
      on: {
        push: {
          branches,
          tags: ['v*.*.*'],
        },
        pull_request: { branches },
      },
      env: {
        REGISTRY: 'ghcr.io',
        IMAGE_NAME: '${{ github.repository }}',
      },
      jobs: {
        build: {
          name: '🐳 Build & Push Docker Image',
          'runs-on': 'ubuntu-latest',
          permissions: {
            contents: 'read',
            packages: 'write',
          },
          steps: [
            this._stepCheckout(),
            {
              name: 'Set up Docker Buildx',
              uses: 'docker/setup-buildx-action@v3',
            },
            {
              name: 'Log in to Container Registry',
              if: "github.event_name != 'pull_request'",
              uses: 'docker/login-action@v3',
              with: {
                registry: '${{ env.REGISTRY }}',
                username: '${{ github.actor }}',
                password: '${{ secrets.GITHUB_TOKEN }}',
              },
            },
            {
              name: 'Extract metadata',
              id: 'meta',
              uses: 'docker/metadata-action@v5',
              with: {
                images: '${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}',
                tags: [
                  'type=ref,event=branch',
                  'type=ref,event=pr',
                  'type=semver,pattern={{version}}',
                  'type=semver,pattern={{major}}.{{minor}}',
                  'type=sha',
                ].join('\n'),
              },
            },
            {
              name: 'Build and push',
              uses: 'docker/build-push-action@v5',
              with: {
                context: '.',
                push: "${{ github.event_name != 'pull_request' }}",
                tags: '${{ steps.meta.outputs.tags }}',
                labels: '${{ steps.meta.outputs.labels }}',
                cache_from: 'type=gha',
                cache_to: 'type=gha,mode=max',
              },
            },
          ],
        },
      },
    };

    return this._toYaml(workflow, `# Generated by cistack v${version}\n# Docker image build and push to GHCR\n\n`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Reusable step builders
  // ══════════════════════════════════════════════════════════════════════════

  _stepCheckout() {
    return { name: 'Checkout code', uses: 'actions/checkout@v4', with: { 'fetch-depth': 0 } };
  }

  /**
   * Returns setup + cache steps for the given language.
   * v2.0.0: added explicit caching for pip, poetry, cargo, maven, gradle, bundler, go, composer.
   */
  _setupSteps(lang, useMatrix = false) {
    const steps = [];
    const cacheOverride = this.extraConfig.cache || {};

    // ── JavaScript / TypeScript ──────────────────────────────────────────
    if (['JavaScript', 'TypeScript'].includes(lang.name)) {
      if (lang.packageManager === 'bun') {
        steps.push({
          name: 'Set up Bun',
          uses: 'oven-sh/setup-bun@v2',
          with: { 'bun-version': 'latest' },
        });
      }
      if (lang.packageManager === 'pnpm') {
        steps.push({ name: 'Install pnpm', uses: 'pnpm/action-setup@v3', with: { version: 'latest' } });
      }
      steps.push({
        name: 'Set up Node.js',
        uses: 'actions/setup-node@v4',
        with: {
          'node-version': useMatrix ? '${{ matrix.node-version }}' : (lang.nodeVersion || '20'),
          // Use native caching in setup-node
          cache: cacheOverride.npm !== false
            ? (lang.packageManager === 'yarn'
              ? 'yarn'
              : lang.packageManager === 'pnpm'
              ? 'pnpm'
              : lang.packageManager === 'npm'
              ? 'npm'
              : undefined)
            : undefined,
        },
      });
    }

    // ── Python ───────────────────────────────────────────────────────────
    if (lang.name === 'Python') {
      steps.push({
        name: 'Set up Python',
        uses: 'actions/setup-python@v5',
        with: { 
          'python-version': useMatrix ? '${{ matrix.python-version }}' : (lang.pythonVersion || '3.11'),
          // Native caching for pip/poetry
          cache: cacheOverride.pip !== false ? (lang.packageManager === 'poetry' ? 'poetry' : 'pip') : undefined
        },
      });
    }

    // ── Go ───────────────────────────────────────────────────────────────
    if (lang.name === 'Go') {
      steps.push({
        name: 'Set up Go',
        uses: 'actions/setup-go@v5',
        with: { 
          'go-version': 'stable', 
          cache: cacheOverride.go !== false 
        },
      });
    }

    // ── Java / Kotlin ─────────────────────────────────────────────────────
    if (lang.name === 'Java' || lang.name === 'Kotlin') {
      steps.push({
        name: 'Set up JDK',
        uses: 'actions/setup-java@v4',
        with: { 
          'java-version': '21', 
          distribution: 'temurin',
          // Native caching for maven/gradle
          cache: cacheOverride.maven !== false ? (lang.packageManager === 'gradle' ? 'gradle' : 'maven') : undefined
        },
      });
    }

    // ── Ruby ─────────────────────────────────────────────────────────────
    if (lang.name === 'Ruby') {
      steps.push({
        name: 'Set up Ruby',
        uses: 'ruby/setup-ruby@v1',
        with: { 'bundler-cache': cacheOverride.bundler !== false },
      });
    }

    // ── Rust ─────────────────────────────────────────────────────────────
    if (lang.name === 'Rust') {
      steps.push({ name: 'Set up Rust', uses: 'dtolnay/rust-toolchain@stable' });

      if (cacheOverride.cargo !== false) {
        steps.push({
          name: 'Cache Cargo registry',
          uses: 'actions/cache@v4',
          with: {
            path: [
              '~/.cargo/registry',
              '~/.cargo/git',
              'target',
            ].join('\n'),
            key: "${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}",
            'restore-keys': '${{ runner.os }}-cargo-',
          },
        });
      }
    }

    // ── PHP ───────────────────────────────────────────────────────────────
    if (lang.name === 'PHP') {
      if (cacheOverride.composer !== false) {
        steps.push({
          name: 'Get Composer cache directory',
          id: 'composer-cache',
          run: 'echo "dir=$(composer config cache-files-dir)" >> $GITHUB_OUTPUT',
        });
        steps.push({
          name: 'Cache Composer packages',
          uses: 'actions/cache@v4',
          with: {
            path: '${{ steps.composer-cache.outputs.dir }}',
            key: "${{ runner.os }}-composer-${{ hashFiles('**/composer.lock') }}",
            'restore-keys': '${{ runner.os }}-composer-',
          },
        });
      }
    }

    return steps;
  }

  _stepInstallDeps(lang) {
    const pm = lang.packageManager;
    if (pm === 'npm')     return { name: 'Install dependencies', run: this.lockFiles.has('package-lock.json') ? 'npm ci' : 'npm install' };
    if (pm === 'yarn')    return { name: 'Install dependencies', run: this.lockFiles.has('yarn.lock') ? 'yarn install --frozen-lockfile' : 'yarn install' };
    if (pm === 'pnpm')    return { name: 'Install dependencies', run: this.lockFiles.has('pnpm-lock.yaml') ? 'pnpm install --frozen-lockfile' : 'pnpm install' };
    if (pm === 'bun')     return { name: 'Install dependencies', run: 'bun install' };
    if (pm === 'pip')     return { name: 'Install dependencies', run: 'pip install -r requirements.txt' };
    if (pm === 'poetry')  return { name: 'Install dependencies', run: 'pip install poetry && poetry install' };
    if (pm === 'pipenv')  return { name: 'Install dependencies', run: 'pip install pipenv && pipenv install --dev' };
    if (pm === 'bundler') return { name: 'Install dependencies', run: 'bundle install' };
    if (pm === 'go mod')  return { name: 'Download modules', run: 'go mod download' };
    if (pm === 'cargo')   return null; // Cargo handles deps on build/test
    if (pm === 'maven')   return { name: 'Install dependencies', run: 'mvn -B dependency:resolve --no-transfer-progress' };
    if (pm === 'gradle')  return { name: 'Install dependencies', run: './gradlew dependencies' };
    if (pm === 'composer') return { name: 'Install dependencies', run: 'composer install --no-interaction --prefer-dist --optimize-autoloader' };
    return { name: 'Install dependencies', run: 'npm ci' };
  }

  _stepLint(lang, pkg = null) {
    if (['JavaScript', 'TypeScript'].includes(lang.name)) {
      const lintScript = this._findScript(['lint', 'lint:ci', 'eslint'], pkg);
      const typeCheck  = this._findScript(['type-check', 'typecheck', 'tsc'], pkg);
      const format     = this._findScript(['format:check', 'prettier:check', 'fmt:check'], pkg);

      const cmds = [];
      if (lintScript) cmds.push(this._scriptCommand(lang, lintScript, pkg));
      if (typeCheck)  cmds.push(this._scriptCommand(lang, typeCheck, pkg));
      if (format)     cmds.push(this._scriptCommand(lang, format, pkg));
      if (cmds.length === 0) {
        const lintTarget = pkg ? pkg.relativePath : '.';
        cmds.push(`npx eslint ${lintTarget} --ext .js,.jsx,.ts,.tsx --max-warnings 0`);
      }

      return { name: 'Lint', run: cmds.join('\n') };
    }

    if (lang.name === 'Python') return { name: 'Lint', run: 'pip install flake8 black && flake8 . && black --check .' };
    if (lang.name === 'Go')     return { name: 'Lint', run: 'gofmt -d . && go vet ./...' };
    if (lang.name === 'Rust')   return { name: 'Lint', run: 'cargo clippy -- -D warnings && cargo fmt --check' };
    if (lang.name === 'Ruby')   return { name: 'Lint', run: 'gem install rubocop && rubocop' };
    if (lang.name === 'PHP')    return { name: 'Lint', run: 'vendor/bin/phpcs && vendor/bin/phpstan analyze' };

    return null;
  }

  _unitTestSteps(lang, pkg = null) {
    if (pkg && ['JavaScript', 'TypeScript'].includes(lang.name)) {
      const pkgTestScript = this._findScript(['test:ci', 'test'], pkg);
      if (pkgTestScript) {
        return [{ name: 'Run tests', run: this._scriptCommand(lang, pkgTestScript, pkg) }];
      }
    }
    return this.unitTests.map((t) => ({ name: `Run ${t.name}`, run: t.command }));
  }

  _buildSteps(lang, pkg = null) {
    const buildScript = this._findScript(['build', 'build:prod', 'compile'], pkg);
    if (!buildScript && !['Go', 'Rust', 'Java', 'Kotlin'].includes(lang.name)) return [];

    const steps = [];
    if (['JavaScript', 'TypeScript'].includes(lang.name) && buildScript) {
      steps.push({ name: 'Build', run: this._scriptCommand(lang, buildScript, pkg), env: { NODE_ENV: 'production' } });
    }
    if (lang.name === 'Go')         steps.push({ name: 'Build', run: 'go build -v ./...' });
    if (lang.name === 'Rust')       steps.push({ name: 'Build', run: 'cargo build --release' });
    if (lang.name === 'Java')       steps.push({ name: 'Build', run: 'mvn -B package --no-transfer-progress -DskipTests' });
    if (lang.name === 'Kotlin')     steps.push({ name: 'Build', run: './gradlew build -x test' });

    return steps;
  }

  _stepUploadArtifact(lang) {
    let buildDir = null;

    if (['JavaScript', 'TypeScript'].includes(lang.name)) {
      buildDir = (this.frameworks[0] && this.frameworks[0].buildDir) || null;
    } else if (lang.name === 'Rust') {
      buildDir = 'target/release';
    } else if (lang.name === 'Java') {
      buildDir = 'target';
    } else if (lang.name === 'Kotlin') {
      buildDir = 'build/libs';
    }

    if (!buildDir) return null;

    return {
      name: 'Upload build artifact',
      uses: 'actions/upload-artifact@v4',
      with: { name: 'build-output', path: buildDir, 'retention-days': 1 },
    };
  }

  _stepUploadCoverage() {
    const hasCoverage = this.unitTests.some((t) =>
      t.command.includes('coverage') || t.command.includes('--cov')
    );
    if (!hasCoverage) return null;
    return {
      name: 'Upload coverage report',
      uses: 'codecov/codecov-action@v4',
      with: { token: '${{ secrets.CODECOV_TOKEN }}', fail_ci_if_error: false },
    };
  }

  _testMatrix(lang) {
    if (['JavaScript', 'TypeScript'].includes(lang.name)) {
      return { matrix: { 'node-version': ['18.x', '20.x', '22.x'] }, 'fail-fast': false };
    }
    if (lang.name === 'Python') {
      return { matrix: { 'python-version': ['3.10', '3.11', '3.12'] }, 'fail-fast': false };
    }
    return null;
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

  _workspaceRunCommand(lang, scriptName) {
    const pm = lang.packageManager || 'npm';
    if (pm === 'pnpm') return `pnpm --filter \${{ matrix.package }} run ${scriptName}`;
    if (pm === 'yarn') return `yarn workspace \${{ matrix.name }} run ${scriptName}`;
    if (pm === 'bun') return `bun run --filter './\${{ matrix.package }}' ${scriptName}`;
    return `npm run ${scriptName} --workspace=\${{ matrix.name }}`;
  }

  _scriptCommand(lang, scriptName, pkg = null) {
    const pm = lang.packageManager || 'npm';

    if (pkg) {
      if (pm === 'pnpm') return `pnpm --filter ${pkg.relativePath} run ${scriptName}`;
      if (pm === 'yarn') return `yarn workspace ${pkg.name} run ${scriptName}`;
      if (pm === 'bun') return `bun run --filter './${pkg.relativePath}' ${scriptName}`;
      return `npm run ${scriptName} --workspace=${pkg.name}`;
    }

    if (pm === 'yarn') return `yarn run ${scriptName}`;
    if (pm === 'pnpm') return `pnpm run ${scriptName}`;
    if (pm === 'bun') return `bun run ${scriptName}`;
    return `npm run ${scriptName}`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Hosting-specific deploy steps
  // ══════════════════════════════════════════════════════════════════════════

  _hostingDeploySteps(h, lang, isPreview = false, productionBranch = null) {
    const steps = [];
    const buildScript = this._findScript(['build', 'build:prod']);
    const runCmd = (s) => this._scriptCommand(lang, s);

    switch (h.name) {
      case 'Firebase': {
        if (buildScript) {
          steps.push({ name: 'Build', run: runCmd(buildScript), env: { NODE_ENV: 'production' } });
        }
        steps.push({
          name: isPreview ? 'Deploy Preview' : 'Deploy to Firebase',
          uses: 'FirebaseExtended/action-hosting-deploy@v0',
          with: {
            repoToken: '${{ secrets.GITHUB_TOKEN }}',
            firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}',
            channelId: isPreview ? 'preview-${{ github.event.number }}' : 'live',
          },
        });
        break;
      }

      case 'Vercel': {
        const prodFlag = isPreview ? '' : '--prod';
        const vercelEnv = {
          VERCEL_TOKEN:      '${{ secrets.VERCEL_TOKEN }}',
          VERCEL_ORG_ID:     '${{ secrets.VERCEL_ORG_ID }}',
          VERCEL_PROJECT_ID: '${{ secrets.VERCEL_PROJECT_ID }}',
        };
        steps.push(
          { name: 'Install Vercel CLI', run: 'npm install -g vercel' },
          {
            name: 'Pull Vercel environment',
            run: `vercel pull --yes --environment=${isPreview ? 'preview' : 'production'} --token=\${{ secrets.VERCEL_TOKEN }}`,
            env: vercelEnv,
          },
          {
            name: 'Build project',
            run: `vercel build${prodFlag ? ' ' + prodFlag : ''} --token=\${{ secrets.VERCEL_TOKEN }}`,
            env: vercelEnv,
          },
          {
            name: 'Deploy to Vercel',
            id: 'deploy',
            run: `vercel deploy --prebuilt${prodFlag ? ' ' + prodFlag : ''} --token=\${{ secrets.VERCEL_TOKEN }} > deployment_url.txt && echo "DEPLOYMENT_URL=$(cat deployment_url.txt)" >> $GITHUB_ENV`,
            env: vercelEnv,
          },
        );
        break;
      }

      case 'Netlify': {
        if (buildScript) {
          steps.push({ name: 'Build', run: runCmd(buildScript), env: { NODE_ENV: 'production' } });
        }
        steps.push({
          name: isPreview ? 'Deploy Preview' : 'Deploy to Netlify',
          id: 'netlify_deploy',
          uses: 'nwtgck/actions-netlify@v3.0',
          with: {
            'publish-dir': h.publishDir || (this.frameworks[0] && this.frameworks[0].buildDir) || 'dist',
            'production-branch': productionBranch || this.defaultBranch || 'main',
            'github-token': '${{ secrets.GITHUB_TOKEN }}',
            'deploy-message': isPreview ? 'Preview Deploy – ${{ github.event.number }}' : 'Production Deploy – ${{ github.sha }}',
            'enable-pull-request-comment': true,
            'enable-commit-comment': true,
            'production-deploy': !isPreview,
            alias: isPreview ? 'preview-${{ github.event.number }}' : undefined,
          },
          env: {
            NETLIFY_AUTH_TOKEN: '${{ secrets.NETLIFY_AUTH_TOKEN }}',
            NETLIFY_SITE_ID: '${{ secrets.NETLIFY_SITE_ID }}',
          },
        });
        if (isPreview) {
          steps.push({
            name: 'Set Netlify URL',
            run: 'echo "DEPLOYMENT_URL=${{ steps.netlify_deploy.outputs.deploy-url }}" >> $GITHUB_ENV'
          });
        }
        break;
      }

      case 'GitHub Pages': {
        if (buildScript) {
          steps.push({ name: 'Build', run: runCmd(buildScript), env: { NODE_ENV: 'production' } });
        }
        steps.push(
          { name: 'Setup Pages', uses: 'actions/configure-pages@v4' },
          {
            name: 'Upload Pages artifact',
            uses: 'actions/upload-pages-artifact@v3',
            with: { path: (this.frameworks[0] && this.frameworks[0].buildDir) || 'dist' },
          },
          { name: 'Deploy to GitHub Pages', id: 'deployment', uses: 'actions/deploy-pages@v4' },
        );
        break;
      }

      case 'AWS': {
        if (buildScript) steps.push({ name: 'Build', run: runCmd(buildScript), env: { NODE_ENV: 'production' } });
        const awsBuildDir = (this.frameworks[0] && this.frameworks[0].buildDir) || 'dist';
        steps.push(
          {
            name: 'Configure AWS credentials',
            uses: 'aws-actions/configure-aws-credentials@v4',
            with: {
              'aws-access-key-id': '${{ secrets.AWS_ACCESS_KEY_ID }}',
              'aws-secret-access-key': '${{ secrets.AWS_SECRET_ACCESS_KEY }}',
              'aws-region': '${{ secrets.AWS_REGION }}',
            },
          },
          { name: 'Sync to S3', run: `aws s3 sync ./${awsBuildDir} s3://\${{ secrets.AWS_S3_BUCKET }} --delete` },
          { name: 'Invalidate CloudFront', run: 'aws cloudfront create-invalidation --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} --paths "/*"' },
        );
        break;
      }

      case 'GCP App Engine': {
        steps.push(
          { name: 'Auth to Google Cloud', uses: 'google-github-actions/auth@v2', with: { credentials_json: '${{ secrets.GCP_SA_KEY }}' } },
          { name: 'Set up Cloud SDK', uses: 'google-github-actions/setup-gcloud@v2' },
          { name: 'Deploy to App Engine', run: 'gcloud app deploy --quiet' },
        );
        break;
      }

      case 'Heroku': {
        if (buildScript) steps.push({ name: 'Build', run: runCmd(buildScript) });
        steps.push({
          name: 'Deploy to Heroku',
          uses: 'akhileshns/heroku-deploy@v3.13.15',
          with: {
            heroku_api_key: '${{ secrets.HEROKU_API_KEY }}',
            heroku_app_name: '${{ secrets.HEROKU_APP_NAME }}',
            heroku_email: '${{ secrets.HEROKU_EMAIL }}',
          },
        });
        break;
      }

      case 'Render': {
        // Render doesn't support PR preview deploys via deploy hook
        if (!isPreview) {
          steps.push({ name: 'Trigger Render deploy', run: 'curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK_URL }}"' });
        }
        break;
      }

      case 'Railway': {
        steps.push(
          { name: 'Install Railway CLI', run: 'npm install -g @railway/cli' },
          { name: 'Deploy to Railway', run: 'railway up', env: { RAILWAY_TOKEN: '${{ secrets.RAILWAY_TOKEN }}' } },
        );
        break;
      }

      case 'Azure': {
        if (buildScript) steps.push({ name: 'Build', run: runCmd(buildScript) });
        steps.push({
          name: 'Deploy to Azure Web App',
          uses: 'azure/webapps-deploy@v3',
          with: {
            'app-name': '${{ secrets.AZURE_APP_NAME }}',
            'publish-profile': '${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}',
            package: (this.frameworks[0] && this.frameworks[0].buildDir) || '.',
          },
        });
        break;
      }

      default:
        steps.push({ name: 'Deploy', run: h.deployCommand || 'echo "No deploy command configured"' });
    }

    return steps;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Env comment block
  // ══════════════════════════════════════════════════════════════════════════

  _envComment() {
    const { secrets, public: pub, sourceFile } = this.envVars;
    if (!sourceFile || (secrets.length === 0 && pub.length === 0)) return '';

    const lines = ['# Environment variables detected from ' + sourceFile + ':'];
    if (secrets.length > 0) {
      lines.push('#   Secrets (add to GitHub -> Settings -> Secrets -> Actions):');
      for (const s of secrets) lines.push('#     ${{ secrets.' + s + ' }}');
    }
    if (pub.length > 0) {
      lines.push('#   Public vars:');
      for (const p of pub) lines.push('#     ' + p);
    }
    return lines.join('\n') + '\n';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Utility helpers
  // ══════════════════════════════════════════════════════════════════════════

  _langForPackage(pkg) {
    if (!pkg || !pkg.packageJson) return this.primaryLang;
    // If the workspace has its own config, pick up its package manager
    const wsPkg = pkg.packageJson;
    const lang = { ...this.primaryLang };
    if (wsPkg.engines && wsPkg.engines.node) {
      const match = wsPkg.engines.node.match(/(\d+)/);
      if (match) lang.nodeVersion = match[1];
    }
    return lang;
  }

  _findScript(names, pkg = null) {
    const fs = require('fs');
    const path = require('path');
    try {
      const pkgPath = pkg ? path.join(this.projectPath, pkg.relativePath, 'package.json') : path.join(this.projectPath, 'package.json');
      const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const scripts = raw.scripts || {};
      for (const n of names) {
        if (scripts[n]) return n;
      }
    } catch (_) {}
    return null;
  }

  _codeQLLanguage(langName) {
    const map = {
      'JavaScript': 'javascript',
      'TypeScript': 'javascript',
      'Python': 'python',
      'Ruby': 'ruby',
      'Go': 'go',
      'Java': 'java',
      'Kotlin': 'java',
      'C#': 'csharp',
      'C++': 'cpp',
      'C': 'cpp',
    };
    return map[langName] || 'javascript';
  }

  _slugify(name) {
    return name.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
  }

  _toYaml(obj, header = '') {
    const raw = yaml.dump(obj, {
      indent: 2,
      lineWidth: 120,
      quotingType: "'",
      forceQuotes: false,
      noRefs: true,
    });
    return header + raw;
  }

  _getPublicEnv() {
    const env = {};
    if (this.envVars && this.envVars.public) {
      for (const p of this.envVars.public) {
        const parts = p.split('=');
        if (parts.length >= 2) {
          env[parts[0]] = parts.slice(1).join('=');
        } else {
          env[p] = `\${{ vars.${p} || secrets.${p} }}`;
        }
      }
    }
    return env;
  }
}

module.exports = WorkflowGenerator;
