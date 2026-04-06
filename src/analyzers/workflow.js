'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const chalk = require('chalk');

class WorkflowAnalyzer {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.workflowsDir = path.join(projectPath, '.github/workflows');
    
    // Latest stable versions for common actions
    this.latestVersions = {
      'actions/checkout': 'v4',
      'actions/setup-node': 'v4',
      'actions/setup-python': 'v5',
      'actions/setup-java': 'v4',
      'actions/setup-go': 'v5',
      'actions/upload-artifact': 'v4',
      'actions/download-artifact': 'v4',
      'actions/cache': 'v4',
      'docker/setup-buildx-action': 'v3',
      'docker/login-action': 'v3',
      'docker/build-push-action': 'v5',
      'docker/metadata-action': 'v5',
      'pnpm/action-setup': 'v3',
      'codecov/codecov-action': 'v4',
      'github/codeql-action/init': 'v3',
      'github/codeql-action/analyze': 'v3',
      'github/codeql-action/autobuild': 'v3',
    };
  }

  async audit() {
    const results = {
      files: [],
      totalIssues: 0,
      suggestions: [],
    };

    if (!fs.existsSync(this.workflowsDir)) {
      return results;
    }

    const files = fs.readdirSync(this.workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

    for (const filename of files) {
      const filePath = path.join(this.workflowsDir, filename);
      const content = fs.readFileSync(filePath, 'utf8');
      
      try {
        const parsed = yaml.load(content);
        const fileIssues = this._auditFile(filename, parsed, content);
        results.files.push({
          filename,
          issues: fileIssues,
        });
        results.totalIssues += fileIssues.length;
      } catch (err) {
        results.files.push({
          filename,
          error: `Failed to parse YAML: ${err.message}`,
        });
      }
    }

    return results;
  }

  _auditFile(filename, parsed, rawContent) {
    const issues = [];

    // 1. Check for concurrency
    if (!parsed.concurrency) {
      issues.push({
        type: 'missing_concurrency',
        severity: 'medium',
        message: 'Missing concurrency group (highly recommended to prevent redundant runs)',
        fix: 'Add concurrency block with cancel-in-progress: true',
      });
    }

    // 2. Check for outdated actions
    const actionRegex = /uses:\s*([\w\-\/]+)@([\w\.]+)/g;
    let match;
    while ((match = actionRegex.exec(rawContent)) !== null) {
      const fullAction = match[0];
      const actionName = match[1];
      const currentVersion = match[2];

      const latest = this.latestVersions[actionName];
      if (latest && this._isOutdated(currentVersion, latest)) {
        issues.push({
          type: 'outdated_action',
          severity: 'low',
          message: `Outdated action: ${actionName}@${currentVersion} (latest is ${latest})`,
          action: actionName,
          current: currentVersion,
          latest: latest,
          fix: `Update to @${latest}`,
        });
      }
    }

    // 3. Check for node-version (hardcoded vs matrix)
    const rawLines = rawContent.split('\n');
    for (let i = 0; i < rawLines.length; i++) {
      if (rawLines[i].includes('node-version:')) {
        const versionMatch = rawLines[i].match(/node-version:\s*['"]?(\d+)['"]?/);
        if (versionMatch && parseInt(versionMatch[1]) < 18) {
          issues.push({
            type: 'old_node_version',
            severity: 'medium',
            message: `Using end-of-life Node.js version: ${versionMatch[1]}`,
            line: i + 1,
            fix: 'Upgrade to Node.js 18 or 20',
          });
        }
      }
    }

    // 4. Check for caching
    if (rawContent.includes('actions/setup-node') && !rawContent.includes('cache:')) {
      issues.push({
        type: 'missing_cache',
        severity: 'high',
        message: 'Dependency caching is not enabled in setup-node',
        fix: 'Add cache: "npm" (or yarn/pnpm) to actions/setup-node',
      });
    }

    return issues;
  }

  async upgrade(dryRun = false) {
    const results = {
      upgradedFiles: [],
      changes: 0,
    };

    if (!fs.existsSync(this.workflowsDir)) {
      return results;
    }

    const files = fs.readdirSync(this.workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

    for (const filename of files) {
      const filePath = path.join(this.workflowsDir, filename);
      let content = fs.readFileSync(filePath, 'utf8');
      let originalContent = content;
      let fileChanges = 0;

      for (const [action, latest] of Object.entries(this.latestVersions)) {
        const regex = new RegExp(`uses:\\s*${action}@([\\w\\.]+)`, 'g');
        content = content.replace(regex, (match, version) => {
          if (this._isOutdated(version, latest)) {
            fileChanges++;
            return `uses: ${action}@${latest}`;
          }
          return match;
        });
      }

      if (fileChanges > 0) {
        if (!dryRun) {
          fs.writeFileSync(filePath, content, 'utf8');
        }
        results.upgradedFiles.push({
          filename,
          changes: fileChanges,
        });
        results.changes += fileChanges;
      }
    }

    return results;
  }

  _isOutdated(current, latest) {
    // Simple version comparison for vX formats
    if (current === latest) return false;
    
    const currNum = parseInt(current.replace('v', ''));
    const lateNum = parseInt(latest.replace('v', ''));
    
    if (!isNaN(currNum) && !isNaN(lateNum)) {
      return currNum < lateNum;
    }
    
    return current !== latest; // Fallback for complex tags
  }
}

module.exports = WorkflowAnalyzer;
