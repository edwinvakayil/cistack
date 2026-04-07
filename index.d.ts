export type PackageManager =
  | 'npm'
  | 'yarn'
  | 'pnpm'
  | 'bun'
  | 'pip'
  | 'poetry'
  | 'pipenv'
  | 'bundler'
  | 'go mod'
  | 'cargo'
  | 'maven'
  | 'gradle'
  | 'composer';

export type HostingName =
  | 'Firebase'
  | 'Vercel'
  | 'Netlify'
  | 'AWS'
  | 'GCP App Engine'
  | 'Azure'
  | 'Heroku'
  | 'Render'
  | 'Railway'
  | 'GitHub Pages'
  | 'Docker';

export type ReleaseTool =
  | 'semantic-release'
  | 'changesets'
  | 'release-it'
  | 'standard-version'
  | 'custom';

export interface CacheConfig {
  npm?: boolean;
  pip?: boolean;
  cargo?: boolean;
  maven?: boolean;
  gradle?: boolean;
  go?: boolean;
  composer?: boolean;
  bundler?: boolean;
}

export interface MonorepoConfig {
  perPackage?: boolean;
}

export interface ReleaseConfig {
  tool: ReleaseTool;
  command?: string;
  publishToNpm?: boolean;
  requiresNpmToken?: boolean;
  branches?: string[];
}

export interface Config {
  nodeVersion?: string | number;
  packageManager?: PackageManager;
  hosting?: HostingName | HostingName[];
  frameworks?: string | string[];
  testing?: string | string[];
  branches?: string[];
  workflowLayout?: 'single' | 'split';
  cache?: CacheConfig;
  monorepo?: MonorepoConfig;
  release?: ReleaseTool | ReleaseConfig;
  secrets?: string[];
  outputDir?: string;
}

export interface CIFlowOptions {
  projectPath: string;
  outputDir?: string;
  dryRun?: boolean;
  force?: boolean;
  prompt?: boolean;
  verbose?: boolean;
  explain?: boolean;
}

declare class CIFlow {
  constructor(options: CIFlowOptions);
  run(): Promise<void>;
  audit(): Promise<void>;
  upgrade(): Promise<void>;
}

export default CIFlow;
