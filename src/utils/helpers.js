'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const yaml = require('js-yaml');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function banner() {
  console.log('\n' + chalk.bold.cyan('  ██████╗██╗███████╗████████╗ █████╗  ██████╗██╗  ██╗'));
  console.log(chalk.bold.cyan('  ██╔════╝██║██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝'));
  console.log(chalk.bold.cyan('  ██║     ██║███████╗   ██║   ███████║██║     █████╔╝ '));
  console.log(chalk.bold.cyan('  ██║     ██║╚════██║   ██║   ██╔══██║██║     ██╔═██╗ '));
  console.log(chalk.bold.cyan('  ╚██████╗██║███████║   ██║   ██║  ██║╚██████╗██║  ██╗'));
  console.log(chalk.bold.cyan('   ╚═════╝╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝'));
  console.log('');
  console.log('  ' + chalk.dim('GitHub Actions pipeline generator  ') + chalk.bold.cyan('v2.0.0'));
  console.log('  ' + chalk.dim('─'.repeat(52)));
  console.log('');
}

/**
 * Smart diff: compare existing workflow YAML with newly generated YAML.
 *
 * Strategy:
 *   1. Parse both into JS objects via js-yaml.
 *   2. Diff at the "jobs" level — for each job key, compare serialised forms.
 *   3. Diff top-level keys (name, on, env, concurrency, permissions).
 *   4. Build a merged object: keep existing jobs/keys that are UNCHANGED,
 *      update jobs/keys that CHANGED, add new jobs/keys.
 *   5. Re-serialise and return { content, changes } where changes is a list of
 *      human-readable change descriptions.
 *
 * If either file fails to parse as YAML we fall back to a full overwrite.
 */
function smartMergeWorkflow(existingContent, newContent) {
  let existing, generated;

  try {
    existing = yaml.load(existingContent);
    generated = yaml.load(newContent);
  } catch (_) {
    // Can't parse — full overwrite
    return { content: newContent, changes: ['full rewrite (YAML parse error)'] };
  }

  if (!existing || !generated) {
    return { content: newContent, changes: ['full rewrite (empty document)'] };
  }

  const changes = [];
  const merged = { ...existing };

  // ── top-level scalar / small keys ────────────────────────────────────────
  const topLevelKeys = ['name', 'on', 'env', 'concurrency', 'permissions', 'defaults'];
  for (const key of topLevelKeys) {
    if (key in generated) {
      const existSer = JSON.stringify(existing[key] ?? null);
      const genSer = JSON.stringify(generated[key] ?? null);
      if (existSer !== genSer) {
        merged[key] = generated[key];
        changes.push(`updated top-level "${key}"`);
      }
    }
  }

  // ── jobs diff ─────────────────────────────────────────────────────────────
  if (generated.jobs) {
    merged.jobs = { ...(existing.jobs || {}) };

    for (const [jobId, genJob] of Object.entries(generated.jobs)) {
      const existJob = existing.jobs && existing.jobs[jobId];

      if (!existJob) {
        // Brand-new job
        merged.jobs[jobId] = genJob;
        changes.push(`added job "${jobId}"`);
      } else {
        const existSer = JSON.stringify(existJob);
        const genSer = JSON.stringify(genJob);

        if (existSer !== genSer) {
          // Job changed — deep merge at step level
          const { job: mergedJob, jobChanges } = _mergeJob(existJob, genJob, jobId);
          merged.jobs[jobId] = mergedJob;
          changes.push(...jobChanges);
        }
        // else — identical, keep existing
      }
    }
  }

  // ── re-serialise ──────────────────────────────────────────────────────────
  // Preserve the cistack header comment from the new content
  const headerMatch = newContent.match(/^(#[^\n]*\n)+\n?/);
  const header = headerMatch ? headerMatch[0] : '';

  const raw = yaml.dump(merged, {
    indent: 2,
    lineWidth: 120,
    quotingType: "'",
    forceQuotes: false,
    noRefs: true,
  });

  return { content: header + raw, changes };
}

/**
 * Merge two job objects at the "steps" level.
 * Steps are matched by their "name" property.
 */
function _mergeJob(existJob, genJob, jobId) {
  const jobChanges = [];
  const merged = { ...existJob };

  // Compare non-steps keys
  for (const key of Object.keys(genJob)) {
    if (key === 'steps') continue;
    const existSer = JSON.stringify(existJob[key] ?? null);
    const genSer = JSON.stringify(genJob[key] ?? null);
    if (existSer !== genSer) {
      merged[key] = genJob[key];
      jobChanges.push(`  job "${jobId}" → updated "${key}"`);
    }
  }

  // Merge steps by name
  if (genJob.steps) {
    const existStepsByName = {};
    for (const s of (existJob.steps || [])) {
      if (s.name) existStepsByName[s.name] = s;
    }

    const mergedSteps = [];
    for (const genStep of genJob.steps) {
      const existStep = existStepsByName[genStep.name];
      if (!existStep) {
        mergedSteps.push(genStep);
        jobChanges.push(`  job "${jobId}" → added step "${genStep.name}"`);
      } else {
        const existSer = JSON.stringify(existStep);
        const genSer = JSON.stringify(genStep);
        if (existSer !== genSer) {
          mergedSteps.push(genStep); // take generated version
          jobChanges.push(`  job "${jobId}" → updated step "${genStep.name}"`);
        } else {
          mergedSteps.push(existStep); // unchanged
        }
      }
    }
    merged.steps = mergedSteps;
  }

  return { job: merged, jobChanges };
}

module.exports = { ensureDir, writeFile, banner, smartMergeWorkflow };
