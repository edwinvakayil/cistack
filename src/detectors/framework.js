'use strict';

const fs = require('fs');
const path = require('path');

class FrameworkDetector {
  constructor(projectPath, codebaseInfo) {
    this.root = projectPath;
    this.info = codebaseInfo;
    this.pkg = codebaseInfo.packageJson || {};
    this.deps = {
      ...(this.pkg.dependencies || {}),
      ...(this.pkg.devDependencies || {}),
    };
    this.configs = new Set(codebaseInfo.configFiles);
    this.files = new Set(codebaseInfo.files);
  }

  async detect() {
    const results = [];

    const checks = [
      // JS / TS frontend
      this._check('Next.js', ['next'], ['next.config.js', 'next.config.ts', 'next.config.mjs'], { buildDir: '.next', nodeVersion: '20' }),
      this._check('Nuxt', ['nuxt', 'nuxt3'], ['nuxt.config.js', 'nuxt.config.ts'], { buildDir: '.nuxt', nodeVersion: '20' }),
      this._check('SvelteKit', ['@sveltejs/kit'], ['svelte.config.js'], { buildDir: '.svelte-kit', nodeVersion: '20' }),
      this._check('Remix', ['@remix-run/react', '@remix-run/node'], [], { nodeVersion: '20' }),
      this._check('Astro', ['astro'], ['astro.config.mjs', 'astro.config.ts'], { buildDir: 'dist', nodeVersion: '20' }),
      this._check('Vite', ['vite'], ['vite.config.js', 'vite.config.ts'], { buildDir: 'dist' }),
      this._check('React', ['react', 'react-dom'], [], { buildDir: 'build' }),
      this._check('Vue', ['vue'], [], { buildDir: 'dist' }),
      this._check('Angular', ['@angular/core'], [], { buildDir: 'dist', nodeVersion: '20' }),
      this._check('Svelte', ['svelte'], ['svelte.config.js'], { buildDir: 'public' }),
      this._check('Gatsby', ['gatsby'], [], { buildDir: 'public', nodeVersion: '20' }),
      this._check('Ember', ['ember-cli'], [], {}),
      // Node / backend
      this._check('Express', ['express'], [], { isServer: true }),
      this._check('Fastify', ['fastify'], [], { isServer: true }),
      this._check('NestJS', ['@nestjs/core'], [], { isServer: true, nodeVersion: '20' }),
      this._check('Hono', ['hono'], [], { isServer: true }),
      this._check('Koa', ['koa'], [], { isServer: true }),
      this._check('tRPC', ['@trpc/server', '@trpc/client'], [], { isServer: true }),
      // Python
      this._checkPython('Django', 'django', 'manage.py'),
      this._checkPython('Flask', 'flask'),
      this._checkPython('FastAPI', 'fastapi'),
      // Ruby
      this._checkRuby('Rails', 'rails'),
      // Java / Kotlin
      this._checkJVM('Spring Boot', 'spring-boot'),
      // PHP
      this._checkComposer('Laravel', 'laravel/framework'),
      // Go
      this._checkGo('Go', 'gin-gonic/gin'),
      // Rust
      this._checkRust('Rust'),
    ].filter(Boolean);

    return checks
      .filter((r) => r.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence);
  }

  // ── generic JS/TS checker ─────────────────────────────────────────────────
  _check(name, depKeys, configFiles, meta = {}) {
    let confidence = 0;

    for (const dep of depKeys) {
      if (this.deps[dep]) { confidence += 0.5; break; }
    }
    for (const cfg of configFiles) {
      if (this.configs.has(cfg) || this.files.has(cfg)) { confidence += 0.4; break; }
    }

    return { name, confidence: Math.min(confidence, 1), ...meta };
  }

  _checkPython(name, pkg, markerFile) {
    let confidence = 0;
    const reqFiles = ['requirements.txt', 'Pipfile', 'pyproject.toml'];
    for (const rf of reqFiles) {
      const fullPath = path.join(this.root, rf);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8').toLowerCase();
        if (content.includes(pkg.toLowerCase())) { confidence += 0.7; break; }
      }
    }
    if (markerFile && this.files.has(markerFile)) confidence += 0.2;
    return confidence > 0 ? { name, confidence: Math.min(confidence, 1), isServer: true, isPython: true } : null;
  }

  _checkRuby(name, gem) {
    const gemfilePath = path.join(this.root, 'Gemfile');
    if (!fs.existsSync(gemfilePath)) return null;
    const content = fs.readFileSync(gemfilePath, 'utf8').toLowerCase();
    const confidence = content.includes(gem.toLowerCase()) ? 0.9 : 0;
    return confidence > 0 ? { name, confidence, isServer: true, isRuby: true } : null;
  }

  _checkJVM(name, keyword) {
    const gradlePath = path.join(this.root, 'build.gradle');
    const pomPath = path.join(this.root, 'pom.xml');
    let confidence = 0;
    for (const p of [gradlePath, pomPath]) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8').toLowerCase();
        if (content.includes(keyword.toLowerCase())) { confidence = 0.9; break; }
      }
    }
    return confidence > 0 ? { name, confidence, isServer: true, isJVM: true } : null;
  }

  _checkComposer(name, pkg) {
    const composerPath = path.join(this.root, 'composer.json');
    if (!fs.existsSync(composerPath)) return null;
    try {
      const composer = JSON.parse(fs.readFileSync(composerPath, 'utf8'));
      const allDeps = { ...(composer.require || {}), ...(composer['require-dev'] || {}) };
      const confidence = allDeps[pkg] ? 0.9 : 0;
      return confidence > 0 ? { name, confidence, isServer: true, isPHP: true } : null;
    } catch (_) { return null; }
  }

  _checkGo(name) {
    const goMod = path.join(this.root, 'go.mod');
    if (!fs.existsSync(goMod)) return null;
    return { name, confidence: 0.9, isServer: true, isGo: true };
  }

  _checkRust(name) {
    const cargoToml = path.join(this.root, 'Cargo.toml');
    if (!fs.existsSync(cargoToml)) return null;
    return { name, confidence: 0.9, isServer: true, isRust: true };
  }
}

module.exports = FrameworkDetector;
