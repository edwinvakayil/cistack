'use strict';

const path = require('path');
const yaml = require('js-yaml');
const { version } = require('../../package.json');

function stripHeader(content) {
  return content.replace(/^(?:#[^\n]*\n)+\n?/, '');
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function dedupeArray(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const key = isPlainObject(value) || Array.isArray(value)
      ? JSON.stringify(value)
      : String(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function mergeDeep(target, source) {
  if (Array.isArray(target) || Array.isArray(source)) {
    return dedupeArray([...(target || []), ...(source || [])]);
  }
  if (isPlainObject(target) && isPlainObject(source)) {
    const merged = { ...target };
    for (const [key, value] of Object.entries(source)) {
      merged[key] = key in merged ? mergeDeep(merged[key], value) : value;
    }
    return merged;
  }
  return source === undefined ? target : source;
}

function mergePermissions(target, source) {
  const rank = { none: 0, read: 1, write: 2 };
  const merged = { ...(target || {}) };

  for (const [key, value] of Object.entries(source || {})) {
    const current = merged[key];
    if (!current) {
      merged[key] = value;
      continue;
    }
    merged[key] = (rank[value] || 0) > (rank[current] || 0) ? value : current;
  }

  return merged;
}

function prefixJobMap(jobs, prefix) {
  const mapping = {};
  for (const jobId of Object.keys(jobs || {})) {
    mapping[jobId] = `${prefix}_${jobId}`;
  }

  const prefixed = {};
  for (const [jobId, job] of Object.entries(jobs || {})) {
    const nextJob = JSON.parse(JSON.stringify(job));
    if (typeof nextJob.needs === 'string') {
      nextJob.needs = mapping[nextJob.needs] || nextJob.needs;
    } else if (Array.isArray(nextJob.needs)) {
      nextJob.needs = nextJob.needs.map((need) => mapping[need] || need);
    }
    prefixed[mapping[jobId]] = nextJob;
  }

  return prefixed;
}

function unwrapExpression(expr) {
  if (typeof expr !== 'string') return '';
  return expr.trim().replace(/^\${{\s*/, '').replace(/\s*}}$/, '');
}

function quote(value) {
  return String(value).replace(/'/g, "\\'");
}

function buildBranchCondition(branches, refName) {
  if (!Array.isArray(branches) || branches.length === 0) return '';
  return branches
    .map((branch) => `${refName} == '${quote(branch)}'`)
    .join(' || ');
}

function buildTriggerCondition(onConfig) {
  if (!onConfig) return '';

  if (typeof onConfig === 'string') {
    return `github.event_name == '${quote(onConfig)}'`;
  }

  if (Array.isArray(onConfig)) {
    return onConfig
      .map((eventName) => `github.event_name == '${quote(eventName)}'`)
      .join(' || ');
  }

  const clauses = [];

  for (const [eventName, eventConfig] of Object.entries(onConfig)) {
    if (eventName === 'push') {
      const branchExpr = buildBranchCondition(eventConfig && eventConfig.branches, 'github.ref_name');
      clauses.push(branchExpr ? `(github.event_name == 'push' && (${branchExpr}))` : "github.event_name == 'push'");
      continue;
    }

    if (eventName === 'pull_request') {
      const branchExpr = buildBranchCondition(eventConfig && eventConfig.branches, 'github.base_ref');
      clauses.push(branchExpr ? `(github.event_name == 'pull_request' && (${branchExpr}))` : "github.event_name == 'pull_request'");
      continue;
    }

    if (eventName === 'workflow_dispatch') {
      clauses.push("github.event_name == 'workflow_dispatch'");
      continue;
    }

    if (eventName === 'schedule') {
      clauses.push("github.event_name == 'schedule'");
      continue;
    }

    clauses.push(`github.event_name == '${quote(eventName)}'`);
  }

  return clauses.join(' || ');
}

function applyTriggerCondition(job, triggerCondition) {
  if (!triggerCondition) return job;

  const nextJob = { ...job };
  const existingIf = unwrapExpression(nextJob.if);
  nextJob.if = existingIf
    ? `(${triggerCondition}) && (${existingIf})`
    : triggerCondition;
  return nextJob;
}

function collectRequiredSecrets(config, releaseInfo) {
  const secrets = new Set();

  for (const hosting of config.hosting || []) {
    for (const secret of hosting.secrets || []) {
      secrets.add(secret);
    }
  }

  for (const secret of (config.envVars && config.envVars.secrets) || []) {
    secrets.add(secret);
  }

  if (releaseInfo && releaseInfo.requiresNpmToken) {
    secrets.add('NPM_TOKEN');
  }

  return [...secrets];
}

function buildHeader(sections, config, releaseInfo) {
  const sectionList = dedupeArray(sections).join(', ');
  const requiredSecrets = collectRequiredSecrets(config, releaseInfo);
  const secretsDoc = requiredSecrets.length > 0
    ? `# Required secrets: ${requiredSecrets.join(', ')}\n# Add these at: Settings → Secrets and Variables → Actions\n`
    : '';

  return (
    `# Generated by cistack v${version} — https://github.com/cistack\n` +
    `# Unified Pipeline: ${sectionList}\n` +
    `${secretsDoc}` +
    `# Dependabot remains in .github/dependabot.yml\n\n`
  );
}

function combineWorkflows(workflows, options = {}) {
  const config = options.config || {};
  const releaseInfo = options.releaseInfo || null;
  const combined = {
    name: 'Pipeline',
    on: {},
    concurrency: {
      group: '${{ github.workflow }}-${{ github.ref }}',
      'cancel-in-progress': true,
    },
    jobs: {},
  };
  const sections = [];

  for (const workflow of workflows.filter(Boolean)) {
    const parsed = yaml.load(stripHeader(workflow.content));
    const triggerCondition = buildTriggerCondition(parsed.on || {});
    const prefix = path.basename(workflow.filename, path.extname(workflow.filename))
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();

    sections.push(prefix);
    combined.on = mergeDeep(combined.on, parsed.on || {});
    if (parsed.env) {
      combined.env = mergeDeep(combined.env || {}, parsed.env);
    }
    if (parsed.permissions) {
      combined.permissions = mergePermissions(combined.permissions, parsed.permissions);
    }

    const prefixedJobs = prefixJobMap(parsed.jobs, prefix);
    for (const [jobId, job] of Object.entries(prefixedJobs)) {
      combined.jobs[jobId] = applyTriggerCondition(job, triggerCondition);
    }
  }

  const raw = yaml.dump(combined, {
    indent: 2,
    lineWidth: 120,
    quotingType: "'",
    forceQuotes: false,
    noRefs: true,
  });

  return {
    filename: 'pipeline.yml',
    content: buildHeader(sections, config, releaseInfo) + raw,
  };
}

module.exports = combineWorkflows;
