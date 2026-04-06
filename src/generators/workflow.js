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
    this.extraConfig = config._config || {}; // raw cistack.config.js

    // Convenient accessors
    this.primaryLang = this.languages[0] || { name: 'JavaScript', packageManager: 'npm', nodeVersion: '20' };
    this.unitTests = this.testing.filter((t) => t.type === 'unit' && t.confidence > 0.3);
    this.e2eTests = this.testing.filter((t) => t.type === 'e2e' && t.confidence > 0.3);
    this.hasDocker = this.hosting.some((h) => h.name === 'Docker');
    this.primaryHosting = this.hosting.filter((h) => h.name !== 'Docker')[0] || null;

    // Monorepo mode: per-package workflows if configured or if > 1 package
    this.isMonorepo = this.monorepoPackages.length > 0;
    this.perPackageWorkflows = this.isMonorepo && (
      (this.extraConfig.monorepo && this.extraConfig.monorepo.perPackage) ||
      this.monorepoPackages.length > 1
    );
  }

  generate() {
    const workflows = [];

    if (this.perPackageWorkflows) {
      // ── Monorepo: one CI file per workspace ─────────────────────────────
      for (const pkg of this.monorepoPackages) {
        workflows.push({
          filename: `ci-${this._slugify(pkg.name)}.yml`,
          content: this._buildCIWorkflow(pkg),
        });
      }
      // Root-level CI file (matrix over all packages)
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

    // ── 4. Security audit ────────────────────────────────────────────────
    workflows.push({
      filename: 'security.yml',
      content: this._buildSecurityWorkflow(),
    });

    return workflows;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CI Workflow
  // ══════════════════════════════════════════════════════════════════════════

  _buildCIWorkflow(pkg = null) {
    const lang = this._langForPackage(pkg);
    const jobs = {};

    const branches = this.extraConfig.branches || ['main', 'master', 'develop'];

    // ── lint job ──────────────────────────────────────────────────────────
    jobs.lint = {
      name: '🔍 Lint & Format',
      'runs-on': 'ubuntu-latest',
      steps: [
        this._stepCheckout(),
        ...this._setupSteps(lang),
        this._stepInstallDeps(lang),
        this._stepLint(lang),
      ].filter(Boolean),
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
          ...this._setupSteps(lang),
          this._stepInstallDeps(lang),
          ...this._unitTestSteps(lang),
          this._stepUploadCoverage(),
        ].filter(Boolean),
      };
    }

    // ── build job ─────────────────────────────────────────────────────────
    const buildSteps = this._buildSteps(lang);
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
          this._stepUploadArtifact(),
        ].filter(Boolean),
      };
    }

    // ── e2e job ───────────────────────────────────────────────────────────
    if (this.e2eTests.length > 0) {
      const e2eTest = this.e2eTests[0];
      jobs.e2e = {
        name: '🎭 E2E Tests',
        'runs-on': 'ubuntu-latest',
        needs: ['build'],
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
    const header =
      `# Generated by cistack v${version} — https://github.com/cistack\n` +
      `# CI Pipeline: lint → test → build${this.e2eTests.length > 0 ? ' → e2e' : ''}\n` +
      envComment +
      `\n`;

    return this._toYaml(workflow, header);
  }

  // ── Monorepo root CI (matrix over all workspaces) ────────────────────────
  _buildMonorepoRootCI() {
    const lang = this.primaryLang;
    const branches = this.extraConfig.branches || ['main', 'master', 'develop'];
    const pkgPaths = this.monorepoPackages.map((p) => p.relativePath);

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
              package: pkgPaths,
            },
            'fail-fast': false,
          },
          steps: [
            this._stepCheckout(),
            ...this._setupSteps(lang),
            {
              name: 'Install dependencies',
              run: lang.packageManager === 'pnpm'
                ? 'pnpm --filter ${{ matrix.package }} install --frozen-lockfile'
                : lang.packageManager === 'yarn'
                ? 'yarn workspace ${{ matrix.package }} install'
                : 'npm ci --workspace=${{ matrix.package }}',
            },
            {
              name: 'Lint',
              run: lang.packageManager === 'pnpm'
                ? 'pnpm --filter ${{ matrix.package }} run lint --if-present'
                : lang.packageManager === 'yarn'
                ? 'yarn workspace ${{ matrix.package }} run lint || true'
                : 'npm run --workspace=${{ matrix.package }} lint || true',
            },
            {
              name: 'Test',
              run: lang.packageManager === 'pnpm'
                ? 'pnpm --filter ${{ matrix.package }} run test --if-present'
                : lang.packageManager === 'yarn'
                ? 'yarn workspace ${{ matrix.package }} run test || true'
                : 'npm run --workspace=${{ matrix.package }} test || true',
            },
            {
              name: 'Build',
              run: lang.packageManager === 'pnpm'
                ? 'pnpm --filter ${{ matrix.package }} run build --if-present'
                : lang.packageManager === 'yarn'
                ? 'yarn workspace ${{ matrix.package }} run build || true'
                : 'npm run --workspace=${{ matrix.package }} build || true',
            },
          ].filter(Boolean),
        },
      },
    };

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
    const branches = this.extraConfig.branches || ['main', 'master'];

    const preDeploySteps = [
      this._stepCheckout(),
      ...this._setupSteps(lang),
      this._stepInstallDeps(lang),
    ].filter(Boolean);

    const deploySteps = this._hostingDeploySteps(h, lang, false); // production
    const previewSteps = this._hostingDeploySteps(h, lang, true);  // preview

    const jobs = {
      deploy: {
        name: `🚀 Deploy → ${h.name} (Production)`,
        if: "github.event_name == 'push' || github.event_name == 'workflow_dispatch'",
        'runs-on': 'ubuntu-latest',
        environment: 'production',
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
        steps: [...preDeploySteps, ...previewSteps].filter(Boolean),
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

    const workflow = {
      name: `Deploy to ${h.name}`,
      on: {
        push: { branches: branches.filter((b) => b !== 'develop') },
        pull_request: { branches },
        workflow_dispatch: {},
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
    const workflow = {
      name: 'Docker Build & Push',
      on: {
        push: {
          branches: ['main', 'master'],
          tags: ['v*.*.*'],
        },
        pull_request: { branches: ['main', 'master'] },
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
  // Security Workflow
  // ══════════════════════════════════════════════════════════════════════════

  _buildSecurityWorkflow() {
    const lang = this.primaryLang;
    const steps = [this._stepCheckout()];

    if (['JavaScript', 'TypeScript'].includes(lang.name)) {
      steps.push(
        ...this._setupSteps(lang),
        this._stepInstallDeps(lang),
        {
          name: 'Audit dependencies',
          run:
            lang.packageManager === 'npm'   ? 'npm audit --audit-level=high' :
            lang.packageManager === 'yarn'  ? 'yarn audit --level high' :
            lang.packageManager === 'pnpm'  ? 'pnpm audit --audit-level high' :
                                              'npm audit --audit-level=high',
        },
      );
    }

    if (lang.name === 'Python') {
      steps.push(
        { name: 'Set up Python', uses: 'actions/setup-python@v5', with: { 'python-version': '3.x' } },
        { name: 'Install safety', run: 'pip install safety' },
        { name: 'Run safety check', run: 'safety check' },
      );
    }

    if (lang.name === 'Rust') {
      steps.push(
        { name: 'Set up Rust', uses: 'dtolnay/rust-toolchain@stable' },
        { name: 'Run cargo audit', run: 'cargo install cargo-audit && cargo audit' },
      );
    }

    // CodeQL analysis
    steps.push(
      {
        name: 'Initialize CodeQL',
        uses: 'github/codeql-action/init@v3',
        with: { languages: this._codeQLLanguage(lang.name) },
      },
      { name: 'Perform CodeQL Analysis', uses: 'github/codeql-action/analyze@v3' },
    );

    const workflow = {
      name: 'Security Audit',
      on: {
        push: { branches: ['main', 'master'] },
        pull_request: { branches: ['main', 'master'] },
        schedule: [{ cron: '0 6 * * 1' }],
      },
      jobs: {
        security: {
          name: '🔒 Security Audit',
          'runs-on': 'ubuntu-latest',
          permissions: {
            actions: 'read',
            contents: 'read',
            'security-events': 'write',
          },
          steps: steps.filter(Boolean),
        },
      },
    };

    return this._toYaml(workflow, `# Generated by cistack v${version}\n# Security: dependency audit + CodeQL analysis (runs weekly)\n\n`);
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
  _setupSteps(lang) {
    const steps = [];
    const cacheOverride = this.extraConfig.cache || {};

    // ── JavaScript / TypeScript ──────────────────────────────────────────
    if (['JavaScript', 'TypeScript'].includes(lang.name)) {
      if (lang.packageManager === 'pnpm') {
        steps.push({ name: 'Install pnpm', uses: 'pnpm/action-setup@v3', with: { version: 'latest' } });
      }
      steps.push({
        name: 'Set up Node.js',
        uses: 'actions/setup-node@v4',
        with: {
          'node-version': lang.nodeVersion || '20',
          // Use native caching in setup-node
          cache: cacheOverride.npm !== false ? (lang.packageManager === 'yarn' ? 'yarn' : lang.packageManager === 'pnpm' ? 'pnpm' : 'npm') : undefined,
        },
      });
    }

    // ── Python ───────────────────────────────────────────────────────────
    if (lang.name === 'Python') {
      steps.push({
        name: 'Set up Python',
        uses: 'actions/setup-python@v5',
        with: { 
          'python-version': '3.x',
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
    if (pm === 'npm')     return { name: 'Install dependencies', run: 'npm ci' };
    if (pm === 'yarn')    return { name: 'Install dependencies', run: 'yarn install --frozen-lockfile' };
    if (pm === 'pnpm')    return { name: 'Install dependencies', run: 'pnpm install --frozen-lockfile' };
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

  _stepLint(lang) {
    const pm = lang.packageManager || 'npm';

    if (['JavaScript', 'TypeScript'].includes(lang.name)) {
      const lintScript = this._findScript(['lint', 'lint:ci', 'eslint']);
      const typeCheck  = this._findScript(['type-check', 'typecheck', 'tsc']);
      const format     = this._findScript(['format:check', 'prettier:check', 'fmt:check']);
      const runPfx     = pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : 'npm run';

      const cmds = [];
      if (lintScript) cmds.push(`${runPfx} ${lintScript}`);
      if (typeCheck)  cmds.push(`${runPfx} ${typeCheck}`);
      if (format)     cmds.push(`${runPfx} ${format}`);
      if (cmds.length === 0) cmds.push('npx eslint . --ext .js,.jsx,.ts,.tsx --max-warnings 0');

      return { name: 'Lint', run: cmds.join('\n') };
    }

    if (lang.name === 'Python') return { name: 'Lint', run: 'pip install flake8 && flake8 .' };
    if (lang.name === 'Go')     return { name: 'Lint', run: 'gofmt -d . && go vet ./...' };
    if (lang.name === 'Rust')   return { name: 'Lint', run: 'cargo clippy -- -D warnings && cargo fmt --check' };
    if (lang.name === 'Ruby')   return { name: 'Lint', run: 'gem install rubocop && rubocop' };
    if (lang.name === 'PHP')    return { name: 'Lint', run: 'vendor/bin/phpcs' };

    return null;
  }

  _unitTestSteps(lang) {
    return this.unitTests.map((t) => ({ name: `Run ${t.name}`, run: t.command }));
  }

  _buildSteps(lang) {
    const pm = lang.packageManager || 'npm';
    const buildScript = this._findScript(['build', 'build:prod']);
    if (!buildScript && !['Go', 'Rust', 'Java', 'Kotlin'].includes(lang.name)) return [];

    const steps = [];
    if (['JavaScript', 'TypeScript'].includes(lang.name) && buildScript) {
      const runPfx = pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : 'npm';
      steps.push({ name: 'Build', run: `${runPfx} run ${buildScript}`, env: { NODE_ENV: 'production' } });
    }
    if (lang.name === 'Go')         steps.push({ name: 'Build', run: 'go build -v ./...' });
    if (lang.name === 'Rust')       steps.push({ name: 'Build', run: 'cargo build --release' });
    if (lang.name === 'Java')       steps.push({ name: 'Build', run: 'mvn -B package --no-transfer-progress -DskipTests' });
    if (lang.name === 'Kotlin')     steps.push({ name: 'Build', run: './gradlew build -x test' });

    return steps;
  }

  _stepUploadArtifact() {
    const buildDir = (this.frameworks[0] && this.frameworks[0].buildDir) || 'dist';
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

  // ══════════════════════════════════════════════════════════════════════════
  // Hosting-specific deploy steps
  // ══════════════════════════════════════════════════════════════════════════

  _hostingDeploySteps(h, lang, isPreview = false) {
    const steps = [];
    const buildScript = this._findScript(['build', 'build:prod']);
    const pm = lang.packageManager || 'npm';
    const runCmd = (s) => `${pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : 'npm'} run ${s}`;

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
        steps.push(
          { name: 'Install Vercel CLI', run: 'npm install -g vercel' },
          { name: 'Pull Vercel environment', run: `vercel pull --yes --environment=${isPreview ? 'preview' : 'production'} --token=\${{ secrets.VERCEL_TOKEN }}` },
          { name: 'Build project', run: `vercel build${prodFlag ? ' ' + prodFlag : ''} --token=\${{ secrets.VERCEL_TOKEN }}` },
          { name: 'Deploy to Vercel', run: `vercel deploy --prebuilt${prodFlag ? ' ' + prodFlag : ''} --token=\${{ secrets.VERCEL_TOKEN }}` },
        );
        break;
      }

      case 'Netlify': {
        if (buildScript) {
          steps.push({ name: 'Build', run: runCmd(buildScript), env: { NODE_ENV: 'production' } });
        }
        steps.push({
          name: isPreview ? 'Deploy Preview' : 'Deploy to Netlify',
          uses: 'nwtgck/actions-netlify@v3.0',
          with: {
            'publish-dir': h.publishDir || 'dist',
            'production-branch': 'main',
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
        steps.push({ name: 'Trigger Render deploy', run: 'curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK_URL }}' });
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

  _findScript(names) {
    const fs = require('fs');
    const path = require('path');
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(this.projectPath, 'package.json'), 'utf8'));
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
}

module.exports = WorkflowGenerator;
