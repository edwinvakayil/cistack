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
    const reasons = [];

    if (this.configs.has('firebase.json')) { confidence += 0.6; reasons.push('firebase.json found'); }
    if (this.configs.has('.firebaserc')) { confidence += 0.3; reasons.push('.firebaserc found'); }
    if (this.deps['firebase-tools'] || this.deps['firebase']) { confidence += 0.2; reasons.push('firebase dependency found'); }
    if (Object.values(this.scripts).some((s) => s.includes('firebase deploy'))) { confidence += 0.3; reasons.push('firebase deploy script found'); }
    if (this.info.srcStructure.hasFunctions) { confidence += 0.1; reasons.push('functions directory found'); }

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
      secrets: ['FIREBASE_SERVICE_ACCOUNT'],
      reasons,
      buildStep: this._detectBuildScript(),
    };
  }

  _checkVercel() {
    let confidence = 0;
    const reasons = [];

    if (this.configs.has('vercel.json')) { confidence += 0.7; reasons.push('vercel.json found'); }
    if (this.configs.has('.vercel')) { confidence += 0.4; reasons.push('.vercel directory found'); }
    if (this.deps['vercel']) { confidence += 0.3; reasons.push('vercel dependency found'); }
    if (Object.values(this.scripts).some((s) => s.includes('vercel'))) { confidence += 0.3; reasons.push('vercel script found'); }

    return {
      name: 'Vercel',
      confidence: Math.min(confidence, 1),
      deployCommand: 'vercel deploy --prod',
      secrets: ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'],
      reasons,
      buildStep: this._detectBuildScript(),
    };
  }

  _checkNetlify() {
    let confidence = 0;
    const reasons = [];

    if (this.configs.has('netlify.toml')) { confidence += 0.7; reasons.push('netlify.toml found'); }
    if (this.configs.has('_redirects')) { confidence += 0.2; reasons.push('_redirects file found'); }
    if (this.deps['netlify-cli'] || this.deps['netlify']) { confidence += 0.3; reasons.push('netlify dependency found'); }
    if (Object.values(this.scripts).some((s) => s.includes('netlify'))) { confidence += 0.3; reasons.push('netlify script found'); }

    let publishDir = null;
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
      reasons,
      publishDir,
      buildStep: this._detectBuildScript(),
    };
  }

  _checkRender() {
    let confidence = 0;
    const reasons = [];
    if (this.configs.has('render.yaml')) { confidence += 0.8; reasons.push('render.yaml detected'); }
    return {
      name: 'Render',
      confidence,
      deployCommand: 'curl -X POST $RENDER_DEPLOY_HOOK_URL',
      secrets: ['RENDER_DEPLOY_HOOK_URL'],
      reasons,
    };
  }

  _checkRailway() {
    let confidence = 0;
    const reasons = [];
    if (this.configs.has('railway.json') || this.configs.has('railway.toml')) { confidence += 0.8; reasons.push('railway config found'); }
    if (this.deps['@railway/cli']) { confidence += 0.2; reasons.push('railway cli dependency found'); }
    return {
      name: 'Railway',
      confidence,
      deployCommand: 'railway up',
      secrets: ['RAILWAY_TOKEN'],
      reasons,
    };
  }

  _checkHeroku() {
    let confidence = 0;
    const reasons = [];
    if (this.configs.has('Procfile')) { confidence += 0.5; reasons.push('Procfile found'); }
    if (this.configs.has('heroku.yml')) { confidence += 0.5; reasons.push('heroku.yml found'); }
    if (this.deps['heroku']) { confidence += 0.2; reasons.push('heroku dependency found'); }
    return {
      name: 'Heroku',
      confidence,
      deployCommand: 'git push heroku main',
      secrets: ['HEROKU_API_KEY', 'HEROKU_APP_NAME', 'HEROKU_EMAIL'],
      reasons,
    };
  }

  _checkGCPAppEngine() {
    let confidence = 0;
    const reasons = [];
    if (this.configs.has('app.yaml')) { confidence += 0.7; reasons.push('app.yaml detected'); }
    if (this.deps['@google-cloud/functions-framework']) { confidence += 0.2; reasons.push('gcp functions framework found'); }
    return {
      name: 'GCP App Engine',
      confidence,
      deployCommand: 'gcloud app deploy',
      secrets: ['GCP_PROJECT_ID', 'GCP_SA_KEY'],
      reasons,
    };
  }

  _checkAWS() {
    let confidence = 0;
    const reasons = [];
    if (this.configs.has('appspec.yml')) { confidence += 0.5; reasons.push('appspec.yml found'); }
    if (this.configs.has('serverless.yml') || this.configs.has('serverless.yaml')) { confidence += 0.6; reasons.push('serverless.yml found'); }
    if (this.configs.has('cdk.json')) { confidence += 0.4; reasons.push('cdk.json found'); }
    if (this.deps['aws-sdk'] || this.deps['@aws-sdk/client-s3']) { confidence += 0.15; reasons.push('aws-sdk found'); }
    const buildDir = this._detectBuildDir();
    return {
      name: 'AWS',
      confidence: Math.min(confidence, 1),
      deployCommand: `aws s3 sync ./${buildDir} s3://$AWS_S3_BUCKET --delete`,
      secrets: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_S3_BUCKET', 'CLOUDFRONT_DISTRIBUTION_ID'],
      reasons,
    };
  }

  _checkAzure() {
    let confidence = 0;
    const reasons = [];
    if (this.files.has('.azure/pipelines.yml')) { confidence += 0.5; reasons.push('.azure/pipelines.yml found'); }
    if (this.deps['@azure/core-http']) { confidence += 0.2; reasons.push('azure core-http found'); }
    return {
      name: 'Azure',
      confidence,
      deployCommand: 'az webapp up',
      secrets: ['AZURE_APP_NAME', 'AZURE_WEBAPP_PUBLISH_PROFILE'],
      reasons,
    };
  }

  _checkGitHubPages() {
    let confidence = 0;
    const reasons = [];
    const pkgHomepage = this.pkg.homepage || '';
    if (pkgHomepage.includes('github.io')) { confidence += 0.6; reasons.push('homepage contains github.io'); }
    if (this.deps['gh-pages']) { confidence += 0.4; reasons.push('gh-pages dependency found'); }
    if (Object.values(this.scripts).some((s) => s.includes('gh-pages'))) { confidence += 0.3; reasons.push('gh-pages script found'); }
    return {
      name: 'GitHub Pages',
      confidence: Math.min(confidence, 1),
      deployCommand: null, // handled by actions/deploy-pages
      secrets: [],
      reasons,
      buildStep: this._detectBuildScript(),
    };
  }

  _checkDocker() {
    let confidence = 0;
    const reasons = [];
    if (this.configs.has('Dockerfile')) { confidence += 0.5; reasons.push('Dockerfile found'); }
    if (this.configs.has('docker-compose.yml') || this.configs.has('docker-compose.yaml')) { confidence += 0.3; reasons.push('docker-compose.yml found'); }
    return {
      name: 'Docker',
      confidence,
      deployCommand: 'docker push $DOCKER_IMAGE',
      secrets: ['DOCKER_USERNAME', 'DOCKER_PASSWORD'],
      reasons,
    };
  }

  _detectBuildScript() {
    const scripts = this.pkg.scripts || {};
    if (scripts.build) return `npm run build`;
    if (scripts['build:prod']) return `npm run build:prod`;
    return null;
  }

  _detectBuildDir() {
    // If codebase has common build dirs
    const dirs = this.info.srcStructure.topDirs || [];
    if (dirs.includes('dist')) return 'dist';
    if (dirs.includes('build')) return 'build';
    return 'dist'; // fallback
  }
}

module.exports = HostingDetector;
