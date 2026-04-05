'use strict';

const path = require('path');
const fs = require('fs');

const EXT_MAP = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.py': 'Python',
  '.rb': 'Ruby',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.scala': 'Scala',
  '.php': 'PHP',
  '.cs': 'C#',
  '.cpp': 'C++',
  '.c': 'C',
  '.swift': 'Swift',
  '.dart': 'Dart',
  '.ex': 'Elixir',
  '.exs': 'Elixir',
  '.hs': 'Haskell',
  '.clj': 'Clojure',
  '.r': 'R',
  '.R': 'R',
  '.lua': 'Lua',
  '.jl': 'Julia',
};

class LanguageDetector {
  constructor(projectPath, codebaseInfo) {
    this.root = projectPath;
    this.info = codebaseInfo;
  }

  async detect() {
    const counts = {};

    for (const file of this.info.files) {
      const ext = path.extname(file).toLowerCase();
      const lang = EXT_MAP[ext] || EXT_MAP[path.extname(file)];
      if (lang) {
        counts[lang] = (counts[lang] || 0) + 1;
      }
    }

    // Package manager hints
    const pkg = this.info.packageJson;
    if (pkg) counts['JavaScript'] = (counts['JavaScript'] || 0) + 5;

    const results = Object.entries(counts)
      .map(([name, fileCount]) => ({
        name,
        fileCount,
        confidence: Math.min(fileCount / 10, 1),
        packageManager: this._packageManager(name),
        nodeVersion: this._nodeVersion(name),
      }))
      .sort((a, b) => b.fileCount - a.fileCount);

    // Normalise: if TS is present, suppress JS unless JS files are dominant
    const hasTS = results.find((r) => r.name === 'TypeScript');
    const hasJS = results.find((r) => r.name === 'JavaScript');
    if (hasTS && hasJS && hasTS.fileCount >= hasJS.fileCount * 0.3) {
      return results.filter((r) => r.name !== 'JavaScript');
    }

    return results;
  }

  _packageManager(lang) {
    const lockFiles = this.info.lockFiles;
    if (lang === 'JavaScript' || lang === 'TypeScript') {
      if (lockFiles.includes('pnpm-lock.yaml')) return 'pnpm';
      if (lockFiles.includes('yarn.lock')) return 'yarn';
      if (lockFiles.includes('bun.lockb')) return 'bun';
      return 'npm';
    }
    if (lang === 'Python') {
      if (lockFiles.includes('poetry.lock')) return 'poetry';
      if (lockFiles.includes('Pipfile.lock')) return 'pipenv';
      return 'pip';
    }
    if (lang === 'Ruby') return 'bundler';
    if (lang === 'Go') return 'go mod';
    if (lang === 'Rust') return 'cargo';
    if (lang === 'Java') {
      if (fs.existsSync(path.join(this.root, 'pom.xml'))) return 'maven';
      return 'gradle';
    }
    if (lang === 'PHP') return 'composer';
    return null;
  }

  _nodeVersion(lang) {
    if (lang !== 'JavaScript' && lang !== 'TypeScript') return null;
    const pkg = this.info.packageJson;
    if (pkg && pkg.engines && pkg.engines.node) {
      const match = pkg.engines.node.match(/(\d+)/);
      if (match) return match[1];
    }
    try {
      const nvmrc = fs.readFileSync(path.join(this.root, '.nvmrc'), 'utf8').trim();
      const match = nvmrc.match(/(\d+)/);
      if (match) return match[1];
    } catch (_) {}
    return '20';
  }
}

module.exports = LanguageDetector;
