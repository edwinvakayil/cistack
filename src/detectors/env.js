'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Detects environment variables documented in .env.example or .env.sample.
 *
 * Returns:
 *   {
 *     secrets: string[],   – keys that look like secrets (TOKEN, KEY, SECRET, PASSWORD, PASS)
 *     public:  string[],   – other public env vars
 *     all:     string[],   – full list in file order
 *     sourceFile: string,  – which file was read
 *   }
 */
class EnvDetector {
  constructor(projectPath, codebaseInfo) {
    this.root = projectPath;
    this.info = codebaseInfo;
  }

  async detect() {
    const candidates = ['.env.example', '.env.sample', '.env.template', '.env.defaults'];

    for (const candidate of candidates) {
      const fullPath = path.join(this.root, candidate);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        return this._parse(content, candidate);
      }
    }

    return { secrets: [], public: [], all: [], sourceFile: null };
  }

  _parse(content, sourceFile) {
    const all = [];
    const secrets = [];
    const publicVars = [];

    const SECRET_PATTERN = /SECRET|TOKEN|KEY|PASSWORD|PASS|PRIVATE|AUTH|CREDENTIAL|CERT|PEM/i;

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();

      // Skip comments and blank lines
      if (!line || line.startsWith('#')) continue;

      // Match KEY=value or KEY= or just KEY
      const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*(?:=.*)?$/i);
      if (!match) continue;

      const key = match[1].toUpperCase();
      if (all.includes(key)) continue; // de-dupe

      all.push(key);
      if (SECRET_PATTERN.test(key)) {
        secrets.push(key);
      } else {
        publicVars.push(key);
      }
    }

    return { secrets, public: publicVars, all, sourceFile };
  }
}

module.exports = EnvDetector;
