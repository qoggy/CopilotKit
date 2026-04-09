/**
 * E2E smoke tests for Docker-built starter templates.
 *
 * Test levels: @health, @agent, @chat, @interaction
 * Targets a running starter container at STARTER_URL (default localhost:3000).
 * The starter is selected by the STARTER env var (default "langgraph-python").
 *
 * All starters share the same CopilotKit UI shell, so interaction selectors
 * are universal — only the agent backend differs per starter.
 */

import { test, expect } from "@playwright/test";
import {
  checkHealth,
  checkAgentEndpoint,
  sendChatMessage,
  setupConsoleErrorCollector,
} from "./helpers";

// ---------------------------------------------------------------------------
// Starter registry
// ---------------------------------------------------------------------------

interface Starter {
  slug: string;
  path: string;
  port: number;
  healthPaths: string[];
  agentPath: string;
  chatMessage: string;
}

const STARTERS: Starter[] = [
  {
    slug: "langgraph-python",
    path: "examples/integrations/langgraph-python",
    port: 3000,
    healthPaths: ["/api/health", "/health", "/"],
    agentPath: "/api/copilotkit",
    chatMessage: "Hello",
  },
];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STARTER_SLUG = process.env.STARTER ?? "langgraph-python";
const STARTER_URL = process.env.STARTER_URL ?? "http://localhost:3000";
const activeStarter = STARTERS.find((s) => s.slug === STARTER_SLUG);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe(`starter-smoke: ${STARTER_SLUG}`, () => {
  test.skip(!activeStarter, `Unknown starter slug: ${STARTER_SLUG}`);

  test(`@health ${STARTER_SLUG} — health endpoint responds`, async ({
    request,
  }) => {
    const result = await checkHealth(
      request,
      STARTER_URL,
      activeStarter!.healthPaths,
    );
    expect(result.ok, `Health check failed: ${result.body}`).toBe(true);
  });

  test(`@agent ${STARTER_SLUG} — agent endpoint is reachable`, async ({
    request,
  }) => {
    const result = await checkAgentEndpoint(
      request,
      STARTER_URL,
      activeStarter!.agentPath,
    );
    expect(result.status, "Agent endpoint returned 404").not.toBe(404);
    expect(result.ok, `Agent check failed: ${result.body}`).toBe(true);
  });

  test(`@chat ${STARTER_SLUG} — chat round-trip via aimock`, async ({
    page,
  }) => {
    test.slow();
    const result = await sendChatMessage(
      page,
      STARTER_URL,
      activeStarter!.chatMessage,
    );
    expect(result.gotResponse, "No assistant response received").toBe(true);
    expect(result.responseText.length).toBeGreaterThan(0);
  });

  test(`@interaction ${STARTER_SLUG} — UI interactions work`, async ({
    page,
  }) => {
    test.slow();
    const { getErrors } = setupConsoleErrorCollector(page);

    await page.goto(STARTER_URL, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    // Remove CopilotKit web inspector overlay (blocks pointer events in dev)
    await page.evaluate(() => {
      document
        .querySelectorAll("cpk-web-inspector")
        .forEach((el) => el.remove());
    });

    // All starters share the same CopilotKit UI shell:
    // Chat/App mode toggle, chat textarea, suggestion pills.

    // Switch to App mode — verify app canvas appears
    const appBtn = page.locator('button:text-is("App")');
    await appBtn.waitFor({ state: "visible", timeout: 10_000 });
    await appBtn.click({ force: true });
    await page.waitForTimeout(1_000);
    await expect(page.locator("text=No todos yet").first()).toBeVisible({
      timeout: 10_000,
    });

    // Switch back to Chat mode — verify textarea reappears
    const chatBtn = page.locator('button:text-is("Chat")');
    await chatBtn.click({ force: true });
    await page.waitForTimeout(1_000);
    await expect(page.locator("textarea").first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify no JS errors throughout
    const errors = getErrors().filter(
      (e) => !e.includes("favicon") && !e.includes("net::ERR_"),
    );
    expect(errors, `JS console errors:\n${errors.join("\n")}`).toHaveLength(0);
  });
});
