import { defineConfig } from "@playwright/test";

const widths = [360, 390, 768, 1024, 1440, 1920];

export default defineConfig({
  testDir: "./tests",
  outputDir: "./artifacts/playwright/results",
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:4173" },
  projects: widths.map((w) => ({
    name: `chromium-${w}`,
    use: {
      browserName: "chromium",
      viewport: { width: w, height: w < 768 ? 800 : 900 },
      hasTouch: w < 768,
      isMobile: w < 768,
    },
  })),
  webServer: {
    command: "npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
});
