'use strict';

const fs = require('fs');
const path = require('path');

class TestingDetector {
  constructor(projectPath, codebaseInfo) {
    this.root = projectPath;
    this.info = codebaseInfo;
    this.pkg = codebaseInfo.packageJson || {};
    this.deps = {
      ...(this.pkg.dependencies || {}),
      ...(this.pkg.devDependencies || {}),
    };
    this.scripts = this.pkg.scripts || {};
    this.configs = new Set(codebaseInfo.configFiles);
    this.files = new Set(codebaseInfo.files);
    this.packageManager = this._detectPackageManager();
  }

  async detect() {
    const results = [];

    const checks = [
      this._checkJest(),
      this._checkVitest(),
      this._checkMocha(),
      this._checkCypress(),
      this._checkPlaywright(),
      this._checkStorybook(),
      this._checkPytest(),
      this._checkRspec(),
      this._checkGo(),
      this._checkCargo(),
      this._checkPHPUnit(),
      this._checkJUnit(),
    ];

    for (const c of checks) {
      if (c && c.confidence > 0) results.push(c);
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  _checkJest() {
    let conf = 0;
    if (this.deps['jest'] || this.deps['@jest/core']) conf += 0.5;
    if (this._hasConfig([
      'jest.config.js',
      'jest.config.cjs',
      'jest.config.mjs',
      'jest.config.ts',
      'jest.config.cts',
      'jest.config.mts',
    ])) conf += 0.4;
    if (this.scripts.test && this.scripts.test.includes('jest')) conf += 0.2;
    return { name: 'Jest', confidence: Math.min(conf, 1), command: this._testScript('jest') || 'npx jest --coverage', type: 'unit' };
  }

  _checkVitest() {
    let conf = 0;
    if (this.deps['vitest']) conf += 0.6;
    if (this._hasConfig([
      'vitest.config.js',
      'vitest.config.cjs',
      'vitest.config.mjs',
      'vitest.config.ts',
      'vitest.config.cts',
      'vitest.config.mts',
    ])) conf += 0.4;
    return { name: 'Vitest', confidence: Math.min(conf, 1), command: this._testScript('vitest') || 'npx vitest run --coverage', type: 'unit' };
  }

  _checkMocha() {
    let conf = 0;
    if (this.deps['mocha']) conf += 0.5;
    if (this._hasConfig(['.mocharc.js', '.mocharc.cjs', '.mocharc.mjs', '.mocharc.yml', '.mocharc.yaml', '.mocharc.json'])) conf += 0.4;
    return { name: 'Mocha', confidence: Math.min(conf, 1), command: 'npx mocha', type: 'unit' };
  }

  _checkCypress() {
    let conf = 0;
    if (this.deps['cypress']) conf += 0.6;
    if (this._hasConfig([
      'cypress.config.js',
      'cypress.config.cjs',
      'cypress.config.mjs',
      'cypress.config.ts',
      'cypress.config.cts',
      'cypress.config.mts',
    ])) conf += 0.4;
    if (this.files.has('cypress/e2e') || [...this.files].some((f) => f.startsWith('cypress/'))) conf += 0.2;
    return { name: 'Cypress', confidence: Math.min(conf, 1), command: 'npx cypress run', type: 'e2e' };
  }

  _checkPlaywright() {
    let conf = 0;
    if (this.deps['@playwright/test']) conf += 0.6;
    if (this._hasConfig([
      'playwright.config.js',
      'playwright.config.cjs',
      'playwright.config.mjs',
      'playwright.config.ts',
      'playwright.config.cts',
      'playwright.config.mts',
    ])) conf += 0.4;
    return { name: 'Playwright', confidence: Math.min(conf, 1), command: 'npx playwright test', type: 'e2e' };
  }

  _checkStorybook() {
    let conf = 0;
    if (this.deps['@storybook/react'] || this.deps['@storybook/vue3'] || this.deps['storybook']) conf += 0.6;
    const hasStories = [...this.files].some((f) => f.endsWith('.stories.tsx') || f.endsWith('.stories.jsx') || f.endsWith('.stories.ts') || f.endsWith('.stories.js'));
    if (hasStories) conf += 0.3;
    return { name: 'Storybook', confidence: Math.min(conf, 1), command: 'npx storybook build', type: 'visual' };
  }

  _checkPytest() {
    let conf = 0;
    const reqPath = path.join(this.root, 'requirements.txt');
    if (fs.existsSync(reqPath) && fs.readFileSync(reqPath, 'utf8').toLowerCase().includes('pytest')) conf += 0.6;
    if (this.files.has('pytest.ini') || this.files.has('conftest.py') || this.configs.has('conftest.py')) conf += 0.3;
    const pyprojectPath = path.join(this.root, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath) && fs.readFileSync(pyprojectPath, 'utf8').includes('pytest')) conf += 0.3;
    return { name: 'Pytest', confidence: Math.min(conf, 1), command: 'pytest --cov', type: 'unit', isPython: true };
  }

  _checkRspec() {
    const gemfilePath = path.join(this.root, 'Gemfile');
    if (!fs.existsSync(gemfilePath)) return { name: 'RSpec', confidence: 0 };
    const content = fs.readFileSync(gemfilePath, 'utf8').toLowerCase();
    const conf = content.includes('rspec') ? 0.9 : 0;
    return { name: 'RSpec', confidence: conf, command: 'bundle exec rspec', type: 'unit', isRuby: true };
  }

  _checkGo() {
    const conf = this.info.lockFiles.includes('go.sum') ? 0.9 : 0;
    return { name: 'Go Test', confidence: conf, command: 'go test ./... -coverprofile=coverage.out', type: 'unit', isGo: true };
  }

  _checkCargo() {
    const cargoPath = path.join(this.root, 'Cargo.toml');
    const conf = fs.existsSync(cargoPath) ? 0.9 : 0;
    return { name: 'Cargo Test', confidence: conf, command: 'cargo test', type: 'unit', isRust: true };
  }

  _checkPHPUnit() {
    const conf = this.configs.has('phpunit.xml') ? 0.9 : 0;
    return { name: 'PHPUnit', confidence: conf, command: 'vendor/bin/phpunit', type: 'unit', isPHP: true };
  }

  _checkJUnit() {
    const conf = fs.existsSync(path.join(this.root, 'pom.xml')) ? 0.6 : 0;
    return { name: 'JUnit', confidence: conf, command: 'mvn test', type: 'unit', isJVM: true };
  }

  _testScript(tool) {
    const scripts = this.pkg.scripts || {};
    if (scripts.test && scripts.test.includes(tool)) return this._runScript('test');
    if (scripts['test:ci']) return this._runScript('test:ci');
    return null;
  }

  _detectPackageManager() {
    const lockFiles = this.info.lockFiles || [];
    if (lockFiles.includes('pnpm-lock.yaml')) return 'pnpm';
    if (lockFiles.includes('yarn.lock')) return 'yarn';
    if (lockFiles.includes('bun.lock') || lockFiles.includes('bun.lockb')) return 'bun';
    return 'npm';
  }

  _runScript(name) {
    if (this.packageManager === 'yarn') return `yarn run ${name}`;
    if (this.packageManager === 'pnpm') return `pnpm run ${name}`;
    if (this.packageManager === 'bun') return `bun run ${name}`;
    return `npm run ${name}`;
  }

  _hasConfig(candidates) {
    return candidates.some((candidate) => this.configs.has(candidate));
  }
}

module.exports = TestingDetector;
