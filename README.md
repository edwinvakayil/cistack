# cistack

> Generate GitHub Actions CI/CD pipelines by analyzing the codebase you already have.

`cistack` scans your project, detects the stack, and writes production-ready GitHub Actions workflows for CI, deployment, Docker, and releases. It is designed for real repos, not toy demos: it reads lock files, framework signals, release config, monorepo workspaces, hosting config, and Git branch metadata before generating YAML.

## Why cistack

- Detects languages, frameworks, testing tools, hosting providers, and release tooling automatically
- Uses your repository's default Git branch when available instead of assuming `main`
- Supports monorepos, per-package workflows, and package-manager-aware commands
- Generates ecosystem-aware Dependabot config, including Bun when `bun.lock` is present
- Smart-merges generated workflows with existing files instead of blindly overwriting them
- Generates deploy pipelines for Vercel, Netlify, Firebase, GitHub Pages, AWS, Azure, Heroku, Render, and Railway
- Ships with built-in workflow audit and upgrade commands
- Includes typed `cistack.config.js` support through `index.d.ts`
- Backed by an automated regression suite covering branch handling, release detection, smart merge behavior, monorepo package scripts, and CLI smoke tests

## Installation

```bash
# One-off usage
npx cistack

# Global install
npm install -g cistack
```

`cistack` supports Node.js 16+, and the project itself is continuously verified on Node.js 18, 20, and 22 in GitHub Actions.

## CLI Usage

### Generate workflows

`generate` is the default command, so both of these work:

```bash
npx cistack
npx cistack generate
```

Common options:

```bash
npx cistack generate --path /path/to/project
npx cistack generate --dry-run
npx cistack generate --explain
npx cistack generate --output .github/workflows
npx cistack generate --no-prompt
```

### Audit existing workflows

```bash
npx cistack audit
```

This checks your generated workflow directory for issues like missing concurrency blocks, outdated actions, old Node versions, and missing dependency caching. If you set `outputDir` in `cistack.config.js`, `audit` and `upgrade` will use that directory too.

### Upgrade workflow actions

```bash
npx cistack upgrade
npx cistack upgrade --dry-run
```

This updates known GitHub Actions to their latest supported stable versions.

### Create a starter config

```bash
npx cistack init
```

This writes `cistack.config.js` with the supported override keys.

## What gets generated

### `pipeline.yml`

By default, `cistack` now generates a single GitHub Actions workflow that combines CI, deploy, Docker, and release jobs into one place so teams can track the whole pipeline from one file.

- Includes lint, test, build, E2E, deploy, Docker, and release jobs when those parts of the stack are detected
- Uses the detected default branch or your configured `branches`
- Keeps preview deploys and release jobs in the same workflow file
- Documents required secrets in the file header

### `dependabot.yml`

Dependabot remains a separate file in `.github/dependabot.yml`, because it is not a GitHub Actions workflow.

If you want preview deployments on Dependabot pull requests, add deployment credentials as Dependabot secrets too, not only Actions secrets. For Vercel, that means `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`.

### Split mode

If you prefer the old multi-file layout, set:

```js
module.exports = {
  workflowLayout: 'split',
};
```

In split mode, `cistack` writes separate `ci.yml`, `deploy.yml`, `docker.yml`, and `release.yml` files again.

## Supported detection

### Hosting

- Firebase
- Vercel
- Netlify
- GitHub Pages
- AWS
- GCP App Engine
- Azure
- Heroku
- Render
- Railway
- Docker

### Frameworks

- Next.js
- Nuxt
- SvelteKit
- Remix
- Astro
- Vite
- React
- Vue
- Angular
- Svelte
- Gatsby
- Express
- Fastify
- NestJS
- Hono
- Koa
- Django
- Flask
- FastAPI
- Rails
- Spring Boot
- Laravel
- Go
- Rust

### Testing tools

- Jest
- Vitest
- Mocha
- Cypress
- Playwright
- Pytest
- RSpec
- Go test
- Cargo test
- PHPUnit
- Maven / JUnit
- Storybook

## Configuration

Create `cistack.config.js` when you want to override detection:

```js
/** @type {import('cistack').Config} */
module.exports = {
  nodeVersion: '20',
  packageManager: 'pnpm',
  branches: ['main', 'staging'],
  workflowLayout: 'single',
  hosting: ['Vercel'],
  outputDir: '.github/workflows',

  cache: {
    npm: true,
    cargo: true,
    pip: true,
  },

  monorepo: {
    perPackage: true,
  },

  release: {
    tool: 'semantic-release',
  },
};
```

Supported top-level config keys:

- `nodeVersion`
- `packageManager`
- `hosting`
- `frameworks`
- `testing`
- `branches`
- `workflowLayout`
- `cache`
- `monorepo`
- `release`
- `secrets`
- `outputDir`

Branch behavior:

- If `branches` is set in config, `cistack` uses it exactly
- Otherwise it reads the repository's default branch from Git metadata when available
- If Git metadata is unavailable, it falls back to safe defaults like `main`, `master`, and `develop` depending on the workflow type

## Secrets

Generated deploy and release workflows document the secrets they need at the top of each file. Add them in:

`GitHub -> Settings -> Secrets and variables -> Actions`

## Development and Quality

The project now includes a regression suite for the areas that were historically the easiest to break:

- config override handling
- default branch detection
- deploy branch selection
- Netlify production branch handling
- smart merge behavior
- monorepo per-package build script lookup
- release config detection
- release workflow generation
- CLI dry-run smoke testing

Run the checks locally:

```bash
npm test
npm run test:smoke
node bin/ciflow.js audit --path .
node bin/ciflow.js upgrade --path . --dry-run
```

If you are using the published package, the executable is `cistack`. In this repository, the local entrypoint is `bin/ciflow.js`.

## License

MIT
