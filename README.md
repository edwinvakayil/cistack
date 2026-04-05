# cistack

> Automatically generate GitHub Actions CI/CD pipelines by analysing your codebase

`cistack` scans your project directory and produces production-grade GitHub Actions workflow YAML files. It detects your language, framework, testing tools, and hosting platform — then writes the best pipeline for your stack.

---

## Features

- 🔍 **Deep codebase analysis** — reads `package.json`, lock files, config files, and directory structure
- 🧠 **Smart detection** — identifies 30+ frameworks, 12 languages, 12+ testing tools, and 10+ hosting platforms
- 🚀 **Hosting auto-detect** — Firebase, Vercel, Netlify, AWS, GCP, Azure, Heroku, Render, Railway, GitHub Pages, Docker
- 🏗️ **Multi-workflow output** — generates separate `ci.yml`, `deploy.yml`, `docker.yml`, and `security.yml` as appropriate
- 🔒 **Security built-in** — CodeQL analysis + dependency auditing on every pipeline
- 📦 **Monorepo aware** — detects Turborepo, Nx, Lerna, pnpm workspaces
- ✅ **Interactive mode** — confirms detected settings before writing files
- 🎯 **Zero config** — works out of the box with no configuration needed

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

```bash
# In your project directory
npx cistack

# Specify a project path
npx cistack --path /path/to/project

# Custom output directory
npx cistack --output .github/workflows

# Dry run (print YAML without writing files)
npx cistack --dry-run

# Skip interactive prompts
npx cistack --no-prompt

# Verbose output
npx cistack --verbose

# Force overwrite existing files
npx cistack --force
```

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

### `deploy.yml` — Continuous Deployment
Triggers on push to `main`/`master` + manual dispatch:
- Platform-specific deploy using the best available GitHub Action
- Proper secret references documented in the file header

### `docker.yml` — Docker Build & Push
Triggers on push to `main` and version tags:
- Multi-platform build via Docker Buildx
- Pushes to GitHub Container Registry (GHCR)
- Build cache via GitHub Actions cache

### `security.yml` — Security Audit
Runs on push, PRs, and weekly schedule:
- Dependency vulnerability audit (npm audit / safety / etc.)
- GitHub CodeQL analysis for the detected language

---

## Required Secrets

After generating, add the required secrets to your repository at:
`Settings → Secrets and variables → Actions`

Each generated `deploy.yml` has a comment at the top listing the exact secrets needed.

---

## Examples

**Next.js + Vercel project:**
```
npx cistack
# → .github/workflows/ci.yml     (lint, test, build)
# → .github/workflows/deploy.yml (vercel deploy)
# → .github/workflows/security.yml
```

**Firebase + React project:**
```
npx cistack
# → .github/workflows/ci.yml
# → .github/workflows/deploy.yml (firebase deploy --only hosting)
# → .github/workflows/security.yml
```

**Node.js API + Docker:**
```
npx cistack
# → .github/workflows/ci.yml
# → .github/workflows/docker.yml (GHCR push)
# → .github/workflows/security.yml
```

---

## License

MIT
