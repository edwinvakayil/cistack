import rootPackage from "../../package.json";

const cliVersion = rootPackage.version;

export type TerminalDemoLineType =
  | "heading"
  | "detail"
  | "success"
  | "info"
  | "question"
  | "written"
  | "done"
  | "path"
  | "blank";

export interface TerminalDemoLine {
  text: string;
  type: TerminalDemoLineType;
  /** Cumulative ms from start of output phase */
  delay: number;
}

export const TERMINAL_DEMO_LINES: readonly TerminalDemoLine[] = [
  { text: `  cistack v${cliVersion}`, type: "heading", delay: 100 },
  { text: `  ${"─".repeat(24)}`, type: "detail", delay: 200 },
  { text: "", type: "blank", delay: 240 },
  { text: "✔ Project scanned", type: "success", delay: 420 },
  { text: "✔ Stack detected", type: "success", delay: 580 },
  { text: "", type: "blank", delay: 620 },
  { text: "  Stack detection summary", type: "heading", delay: 720 },
  { text: "  Languages:           TypeScript", type: "info", delay: 820 },
  { text: "  Frameworks:          Next.js", type: "info", delay: 920 },
  { text: "  Hosting:             Vercel", type: "info", delay: 1020 },
  { text: "  Testing:             None", type: "info", delay: 1120 },
  { text: "  Release tool:        None", type: "info", delay: 1220 },
  { text: "", type: "blank", delay: 1260 },
  {
    text: "Does this look correct? Generate pipeline with these settings? Yes",
    type: "question",
    delay: 1420,
  },
  { text: "✔ Generated 1 workflow file", type: "success", delay: 1620 },
  {
    text: "  ✔ Written:      .github/workflows/pipeline.yml",
    type: "written",
    delay: 1780,
  },
  {
    text: "  ✔ Written:      .github/dependabot.yml",
    type: "written",
    delay: 1920,
  },
  { text: "", type: "blank", delay: 1980 },
  {
    text: "Done! Your GitHub Actions pipeline is ready.",
    type: "done",
    delay: 2140,
  },
  {
    text: "   Pipeline → .github/workflows/pipeline.yml",
    type: "path",
    delay: 2320,
  },
  {
    text: "   Dependabot → .github/dependabot.yml",
    type: "path",
    delay: 2480,
  },
];

export const terminalDemoPlainText = TERMINAL_DEMO_LINES.map((l) => l.text).join("\n");
