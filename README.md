# cistack

> Automatically generate GitHub Actions CI/CD pipelines by analysing your codebase

`cistack` scans your project directory and produces production-grade GitHub Actions workflow YAML files. It detects your language, framework, testing tools, and hosting platform — then writes the best pipeline for your stack.

---

## Features

- 🔍 **Deep codebase analysis** — reads `package.json`, lock files, config files, and directory structure
- 🧠 **Smart detection** — identifies 30+ frameworks, 12 languages, 12+ testing tools, and 10+ hosting platforms
- ⚡ **Native Cache support** — speeds up pipelines by 2–4min using native caching for npm, pip, go, cargo, maven, gradle, and bundler
- ✨ **PR Preview Deploys** — automatic preview environments for Vercel and Netlify on every pull request
- 🚀 **Hosting auto-detect** — Firebase, Vercel, Netlify, AWS, GCP, Azure, Heroku, Render, Railway, GitHub Pages, Docker
- 🛡️ **Workflow Audit & Upgrade** — analyse existing `.github/workflows` for outdated actions and missing best practices
- 🏗️ **Multi-workflow output** — generates separate `ci.yml`, `deploy.yml`, `docker.yml`, and `security.yml`
- 🔒 **Security built-in** — CodeQL analysis + dependency auditing on every pipeline
- 📦 **Monorepo aware** — detects Turborepo, Nx, Lerna, pnpm workspaces (supports per-package workflows)
- ✅ **Interactive mode** — confirms detected settings before writing files
- 🎯 **Zero config** — works out of the box with `cistack.config.js` for overrides

---

## Installation

```bash
# Run without installing (recommended for one-off use)
npx cistack

# Install globally
npm install -g cistack
```

---

## Usage

### Generate Pipelines
Analyze your stack and generate best-practice workflows.
```bash
# In your project directory
npx cistack

# Show reasoning for detected stack
npx cistack --explain

# Specify a project path
npx cistack --path /path/to/project

# Custom output directory
npx cistack --output .github/workflows

# Dry run (print YAML without writing files)
npx cistack --dry-run
```

### Audit Existing Workflows
Analyze your current `.github/workflows` folder for outdated actions or missing features.
```bash
npx cistack audit
```

### Automatic Upgrade
Automatically bump all action versions (e.g., `actions/checkout@v3` → `@v4`) across all your workflow files to the latest stable releases.
```bash
npx cistack upgrade
```

### Initialization
Create a `cistack.config.js` to override auto-detected settings.
```bash
npx cistack init
```

---

## Flags

- `--explain` — Show detailed reasoning for every detection (build trust)
- `--dry-run` — Print YAML to terminal without writing to disk
- `--force` — Overwrite existing files instead of smart-merging
- `--no-prompt` — Skip interactive confirmation
- `--verbose` — Show raw analysis data
- `--path <dir>` — Project root directory
- `--output <dir>` — Workflow output directory (default: `.github/workflows`)

---

## Detected Hosting Platforms

| Platform | Detection Signal |
|---|---|
| **Firebase** | `firebase.json`, `.firebaserc`, `firebase-tools` dep |
| **Vercel** | `vercel.json`, `.vercel` dir, `vercel` dep |
| **Netlify** | `netlify.toml`, `_redirects`, `netlify-cli` dep |
| **GitHub Pages** | `gh-pages` dep, `github.io` homepage in `package.json` |
| **AWS** | `serverless.yml`, `appspec.yml`, `cdk.json`, `aws-sdk` dep |
| **GCP App Engine** | `app.yaml` |
| **Azure** | `azure/pipelines.yml`, `@azure/*` deps |
| **Heroku** | `Procfile`, `heroku.yml` |
| **Render** | `render.yaml` |
| **Railway** | `railway.json`, `railway.toml` |
| **Docker** | `Dockerfile`, `docker-compose.yml` |

---

## Detected Frameworks

Next.js, Nuxt, SvelteKit, Remix, Astro, Vite, React, Vue, Angular, Svelte, Gatsby,
Express, Fastify, NestJS, Hono, Koa, tRPC,
Django, Flask, FastAPI,
Ruby on Rails,
Spring Boot,
Laravel,
Go (gin), Rust (Cargo)

---

## Detected Testing Tools

| Tool | Type |
|---|---|
| Jest, Vitest, Mocha | Unit |
| Cypress, Playwright | E2E |
| Pytest | Python unit |
| RSpec | Ruby unit |
| Go Test | Go unit |
| Cargo Test | Rust unit |
| PHPUnit | PHP unit |
| JUnit/Maven | JVM unit |
| Storybook | Visual |

---

## Generated Workflows

### `ci.yml` — Continuous Integration
Runs on every push and pull request:
1. **Lint** — ESLint, TypeScript type-check, formatter check
2. **Test** — unit tests with coverage upload (matrix across Node versions)
3. **Build** — production build, artifact upload
4. **E2E** — Cypress / Playwright (if detected)
5. **Caching** — Full dependency caching for faster runs

### `deploy.yml` — Continuous Deployment
Triggers on push to `main`/`master` + manual dispatch:
- Platform-specific deploy using official GitHub Actions
- **PR Preview Deploys** — automatic previews for Vercel and Netlify pull requests
- Proper secret references documented in the file header

### `docker.yml` — Docker Build & Push
Triggers on push to `main` and version tags:
- Multi-platform build via Docker Buildx
- Pushes to GitHub Container Registry (GHCR)
- Build cache via GitHub Actions cache (GHA)

### `security.yml` — Security Audit
Runs on push, PRs, and weekly schedule:
- Dependency vulnerability audit (npm audit / safety / cargo audit)
- GitHub CodeQL analysis for the detected language

---

## Required Secrets

After generating, add the required secrets to your repository at:
`Settings → Secrets and variables → Actions`

Each generated `deploy.yml` has a comment at the top listing the exact secrets needed.

---

## Examples

**Next.js + Vercel project with Audit:**
```bash
npx cistack audit       # Check existing workflows
npx cistack upgrade     # Update versions to v4
npx cistack generate    # Refresh with latest caching & previews
```

---

## License

MIT
