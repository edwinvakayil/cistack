'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Detects hosting platforms from config files, package.json deps, and directory structure.
 * Each result: { name, confidence (0–1), deployCommand, secrets, notes }
 */
class HostingDetector {
  constructor(projectPath, codebaseInfo) {
    this.root = projectPath;
    this.info = codebaseInfo;
    this.pkg = codebaseInfo.packageJson || {};
    this.deps = {
      ...((this.pkg.dependencies) || {}),
      ...((this.pkg.devDependencies) || {}),
    };
    this.scripts = this.pkg.scripts || {};
    this.configs = new Set(codebaseInfo.configFiles);
    this.files = new Set(codebaseInfo.files);
  }

  async detect() {
    const results = [];

    const checks = [
      this._checkFirebase(),
      this._checkVercel(),
      this._checkNetlify(),
      this._checkRender(),
      this._checkRailway(),
      this._checkHeroku(),
      this._checkGCPAppEngine(),
      this._checkAWS(),
      this._checkAzure(),
      this._checkGitHubPages(),
      this._checkDocker(),
    ];

    for (const result of checks) {
      if (result && result.confidence > 0) {
        results.push(result);
      }
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    // De-duplicate by name
    const seen = new Set();
    return results.filter((r) => {
      if (seen.has(r.name)) return false;
      seen.add(r.name);
      return true;
    });
  }

  // ── individual checks ─────────────────────────────────────────────────────

  _checkFirebase() {
    let confidence = 0;
    const notes = [];

    if (this.configs.has('firebase.json')) { confidence += 0.6; notes.push('firebase.json found'); }
    if (this.configs.has('.firebaserc')) { confidence += 0.3; notes.push('.firebaserc found'); }
    if (this.deps['firebase-tools'] || this.deps['firebase']) { confidence += 0.2; notes.push('firebase dep'); }
    if (Object.values(this.scripts).some((s) => s.includes('firebase deploy'))) { confidence += 0.3; notes.push('deploy script'); }
    if (this.info.srcStructure.hasFunctions) { confidence += 0.1; }

    // Detect what Firebase services are used
    let deployTarget = 'hosting';
    try {
      const fbJson = JSON.parse(fs.readFileSync(path.join(this.root, 'firebase.json'), 'utf8'));
      const services = [];
      if (fbJson.hosting) services.push('hosting');
      if (fbJson.functions) services.push('functions');
      if (fbJson.firestore) services.push('firestore');
      if (fbJson.storage) services.push('storage');
      deployTarget = services.join(',') || 'hosting';
    } catch (_) {}

    return {
      name: 'Firebase',
      confidence: Math.min(confidence, 1),
      deployCommand: `firebase deploy --only ${deployTarget}`,
      secrets: ['FIREBASE_TOKEN'],
      notes,
      buildStep: this._detectBuildScript(),
    };
  }

  _checkVercel() {
    let confidence = 0;
    const notes = [];

    if (this.configs.has('vercel.json')) { confidence += 0.7; notes.push('vercel.json found'); }
    if (this.configs.has('.vercel')) { confidence += 0.4; notes.push('.vercel dir found'); }
    if (this.deps['vercel']) { confidence += 0.3; notes.push('vercel dep'); }
    if (Object.values(this.scripts).some((s) => s.includes('vercel'))) { confidence += 0.3; notes.push('vercel script'); }

    return {
      name: 'Vercel',
      confidence: Math.min(confidence, 1),
      deployCommand: 'vercel --prod --token $VERCEL_TOKEN',
      secrets: ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'],
      notes,
      buildStep: this._detectBuildScript(),
    };
  }

  _checkNetlify() {
    let confidence = 0;
    const notes = [];

    if (this.configs.has('netlify.toml')) { confidence += 0.7; notes.push('netlify.toml found'); }
    if (this.configs.has('_redirects')) { confidence += 0.2; notes.push('_redirects found'); }
    if (this.deps['netlify-cli'] || this.deps['netlify']) { confidence += 0.3; notes.push('netlify dep'); }
    if (Object.values(this.scripts).some((s) => s.includes('netlify'))) { confidence += 0.3; notes.push('netlify script'); }

    let publishDir = 'dist';
    try {
      const toml = fs.readFileSync(path.join(this.root, 'netlify.toml'), 'utf8');
      const match = toml.match(/publish\s*=\s*["']?([^"'\n]+)/);
      if (match) publishDir = match[1].trim();
    } catch (_) {}

    return {
      name: 'Netlify',
      confidence: Math.min(confidence, 1),
      deployCommand: `netlify deploy --prod --dir=${publishDir}`,
      secrets: ['NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID'],
      notes,
      publishDir,
      buildStep: this._detectBuildScript(),
    };
  }

  _checkRender() {
    let confidence = 0;
    if (this.configs.has('render.yaml')) { confidence += 0.8; }
    return {
      name: 'Render',
      confidence,
      deployCommand: 'curl -X POST $RENDER_DEPLOY_HOOK_URL',
      secrets: ['RENDER_DEPLOY_HOOK_URL'],
      notes: ['render.yaml detected'],
    };
  }

  _checkRailway() {
    let confidence = 0;
    if (this.configs.has('railway.json') || this.configs.has('railway.toml')) confidence += 0.8;
    if (this.deps['@railway/cli']) confidence += 0.2;
    return {
      name: 'Railway',
      confidence,
      deployCommand: 'railway up',
      secrets: ['RAILWAY_TOKEN'],
      notes: [],
    };
  }

  _checkHeroku() {
    let confidence = 0;
    if (this.configs.has('Procfile')) { confidence += 0.5; }
    if (this.configs.has('heroku.yml')) { confidence += 0.5; }
    if (this.deps['heroku']) { confidence += 0.2; }
    return {
      name: 'Heroku',
      confidence,
      deployCommand: 'git push heroku main',
      secrets: ['HEROKU_API_KEY', 'HEROKU_APP_NAME'],
      notes: [],
    };
  }

  _checkGCPAppEngine() {
    let confidence = 0;
    if (this.configs.has('app.yaml')) { confidence += 0.7; }
    if (this.deps['@google-cloud/functions-framework']) confidence += 0.2;
    return {
      name: 'GCP App Engine',
      confidence,
      deployCommand: 'gcloud app deploy',
      secrets: ['GCP_PROJECT_ID', 'GCP_SA_KEY'],
      notes: [],
    };
  }

  _checkAWS() {
    let confidence = 0;
    if (this.configs.has('appspec.yml')) confidence += 0.5;
    if (this.configs.has('serverless.yml') || this.configs.has('serverless.yaml')) confidence += 0.6;
    if (this.configs.has('cdk.json')) confidence += 0.4;
    if (this.deps['aws-sdk'] || this.deps['@aws-sdk/client-s3']) confidence += 0.15;
    return {
      name: 'AWS',
      confidence: Math.min(confidence, 1),
      deployCommand: 'aws s3 sync ./dist s3://$AWS_S3_BUCKET --delete',
      secrets: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
      notes: [],
    };
  }

  _checkAzure() {
    let confidence = 0;
    if (this.files.has('.azure/pipelines.yml')) confidence += 0.5;
    if (this.deps['@azure/core-http']) confidence += 0.2;
    return {
      name: 'Azure',
      confidence,
      deployCommand: 'az webapp up',
      secrets: ['AZURE_CREDENTIALS'],
      notes: [],
    };
  }

  _checkGitHubPages() {
    let confidence = 0;
    const pkgHomepage = this.pkg.homepage || '';
    if (pkgHomepage.includes('github.io')) { confidence += 0.6; }
    if (this.deps['gh-pages']) { confidence += 0.4; }
    if (Object.values(this.scripts).some((s) => s.includes('gh-pages'))) confidence += 0.3;
    return {
      name: 'GitHub Pages',
      confidence: Math.min(confidence, 1),
      deployCommand: null, // handled by actions/deploy-pages
      secrets: [],
      notes: [],
      buildStep: this._detectBuildScript(),
    };
  }

  _checkDocker() {
    let confidence = 0;
    if (this.configs.has('Dockerfile')) confidence += 0.5;
    if (this.configs.has('docker-compose.yml') || this.configs.has('docker-compose.yaml')) confidence += 0.3;
    return {
      name: 'Docker',
      confidence,
      deployCommand: 'docker push $DOCKER_IMAGE',
      secrets: ['DOCKER_USERNAME', 'DOCKER_PASSWORD'],
      notes: [],
    };
  }

  _detectBuildScript() {
    const scripts = this.pkg.scripts || {};
    if (scripts.build) return `npm run build`;
    if (scripts['build:prod']) return `npm run build:prod`;
    return null;
  }
}

module.exports = HostingDetector;
