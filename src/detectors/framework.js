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
    const results = [
      // JS / TS frontend
      this._check('Next.js', ['next'], ['next.config.js', 'next.config.cjs', 'next.config.mjs', 'next.config.ts', 'next.config.cts', 'next.config.mts'], { buildDir: '.next', priority: 10 }),
      this._check('Nuxt', ['nuxt', 'nuxt3'], ['nuxt.config.js', 'nuxt.config.cjs', 'nuxt.config.mjs', 'nuxt.config.ts', 'nuxt.config.cts', 'nuxt.config.mts'], { buildDir: '.nuxt', priority: 10 }),
      this._check('SvelteKit', ['@sveltejs/kit'], ['svelte.config.js', 'svelte.config.cjs', 'svelte.config.mjs', 'svelte.config.ts', 'svelte.config.cts', 'svelte.config.mts'], { buildDir: '.svelte-kit', priority: 10 }),
      this._check('Remix', ['@remix-run/react', '@remix-run/node'], [], { priority: 10 }),
      this._check('Astro', ['astro'], ['astro.config.js', 'astro.config.cjs', 'astro.config.mjs', 'astro.config.ts'], { buildDir: 'dist', priority: 10 }),
      this._check('Vite', ['vite'], ['vite.config.js', 'vite.config.cjs', 'vite.config.mjs', 'vite.config.ts', 'vite.config.cts', 'vite.config.mts'], { buildDir: 'dist', priority: 5 }),
      this._check('React', ['react', 'react-dom'], [], { buildDir: 'build', priority: 1 }),
      this._check('Vue', ['vue'], [], { buildDir: 'dist', priority: 1 }),
      this._check('Angular', ['@angular/core'], [], { buildDir: 'dist', priority: 1 }),
      this._check('Svelte', ['svelte'], ['svelte.config.js', 'svelte.config.cjs', 'svelte.config.mjs', 'svelte.config.ts', 'svelte.config.cts', 'svelte.config.mts'], { buildDir: 'public', priority: 1 }),
      this._check('Gatsby', ['gatsby'], [], { buildDir: 'public', priority: 1 }),
      this._check('Ember', ['ember-cli'], [], { priority: 1 }),
      // Node / backend
      this._check('Express', ['express'], [], { isServer: true }),
      this._check('Fastify', ['fastify'], [], { isServer: true }),
      this._check('NestJS', ['@nestjs/core'], [], { isServer: true }),
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
      this._checkJVM('Spring Boot', ['spring-boot', 'org.springframework.boot']),
      // PHP
      this._checkComposer('Laravel', 'laravel/framework'),
      // Go
      this._checkGo('Go', 'gin-gonic/gin'),
      // Rust
      this._checkRust('Rust'),
    ].filter(Boolean);

    // Filter by confidence and priority
    const filtered = results.filter((r) => r.confidence > 0);
    const hasMeta = filtered.some(r => (r.priority || 0) >= 10);
    
    return filtered
      .filter(r => !hasMeta || (r.priority || 0) >= 10)
      .sort((a, b) => b.confidence - a.confidence);
  }

  // ── generic JS/TS checker ─────────────────────────────────────────────────
  _check(name, depKeys, configFiles, meta = {}) {
    let confidence = 0;
    const reasons = [];

    for (const dep of depKeys) {
      if (this.deps[dep]) { 
        confidence += 0.5; 
        reasons.push(`dependency: ${dep}`);
        break; 
      }
    }
    for (const cfg of configFiles) {
      if (this.configs.has(cfg) || this.files.has(cfg)) { 
        confidence += 0.4; 
        reasons.push(`config file: ${cfg}`);
        break; 
      }
    }

    return { name, confidence: Math.min(confidence, 1), reasons, ...meta };
  }

  _checkPython(name, pkg, markerFile) {
    let confidence = 0;
    const reasons = [];
    const reqFiles = ['requirements.txt', 'Pipfile', 'pyproject.toml'];
    for (const rf of reqFiles) {
      const fullPath = path.join(this.root, rf);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8').toLowerCase();
        if (content.includes(pkg.toLowerCase())) { 
          confidence += 0.7; 
          reasons.push(`found ${pkg} in ${rf}`);
          break; 
        }
      }
    }
    if (markerFile && this.files.has(markerFile)) {
      confidence += 0.2;
      reasons.push(`found marker file ${markerFile}`);
    }
    return confidence > 0 ? { name, confidence: Math.min(confidence, 1), isServer: true, isPython: true, reasons } : null;
  }

  _checkRuby(name, gem) {
    const gemfilePath = path.join(this.root, 'Gemfile');
    if (!fs.existsSync(gemfilePath)) return null;
    const content = fs.readFileSync(gemfilePath, 'utf8').toLowerCase();
    const confidence = content.includes(gem.toLowerCase()) ? 0.9 : 0;
    const reasons = confidence > 0 ? [`found ${gem} in Gemfile`] : [];
    return confidence > 0 ? { name, confidence, isServer: true, isRuby: true, reasons } : null;
  }

  _checkJVM(name, keywords) {
    const gradlePath = path.join(this.root, 'build.gradle');
    const gradleKtsPath = path.join(this.root, 'build.gradle.kts');
    const pomPath = path.join(this.root, 'pom.xml');
    let confidence = 0;
    let foundIn = '';
    const candidates = Array.isArray(keywords) ? keywords : [keywords];
    for (const p of [gradlePath, gradleKtsPath, pomPath]) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8').toLowerCase();
        if (candidates.some((keyword) => content.includes(keyword.toLowerCase()))) {
          confidence = 0.9;
          foundIn = path.basename(p);
          break;
        }
      }
    }
    const reasons = confidence > 0 ? [`found ${name} markers in ${foundIn}`] : [];
    return confidence > 0 ? { name, confidence, isServer: true, isJVM: true, reasons } : null;
  }

  _checkComposer(name, pkg) {
    const composerPath = path.join(this.root, 'composer.json');
    if (!fs.existsSync(composerPath)) return null;
    try {
      const composer = JSON.parse(fs.readFileSync(composerPath, 'utf8'));
      const allDeps = { ...(composer.require || {}), ...(composer['require-dev'] || {}) };
      const confidence = allDeps[pkg] ? 0.9 : 0;
      const reasons = confidence > 0 ? [`found ${pkg} in composer.json`] : [];
      return confidence > 0 ? { name, confidence, isServer: true, isPHP: true, reasons } : null;
    } catch (_) { return null; }
  }

  _checkGo(name) {
    const goMod = path.join(this.root, 'go.mod');
    if (!fs.existsSync(goMod)) return null;
    return { name, confidence: 0.9, isServer: true, isGo: true, reasons: ['go.mod found'] };
  }

  _checkRust(name) {
    const cargoToml = path.join(this.root, 'Cargo.toml');
    if (!fs.existsSync(cargoToml)) return null;
    return { name, confidence: 0.9, isServer: true, isRust: true, reasons: ['Cargo.toml found'] };
  }
}

module.exports = FrameworkDetector;
