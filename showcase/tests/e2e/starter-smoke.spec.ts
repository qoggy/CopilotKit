/**
 * E2E smoke tests for Docker-built starter templates.
 *
 * Targets a running starter container at STARTER_URL (default localhost:3000).
 * The starter is selected by the STARTER env var (default "langgraph-python").
 */

import { test, expect } from "@playwright/test";
import {
  checkHealth,
  checkAgentEndpoint,
  sendChatMessage,
  setupConsoleErrorCollector,
} from "./helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StarterInteraction {
  name: string;
  selector: string;
  expect:
    | { type: "visible"; selector: string }
    | { type: "count-increased"; selector: string }
    | { type: "no-error" };
}

interface Starter {
  slug: string;
  path: string;
  port: number;
  healthPaths: string[];
  agentPath: string;
  agentId: string;
  chatMessage: string;
  interactions: StarterInteraction[];
}

// ---------------------------------------------------------------------------
// Starter registry
// ---------------------------------------------------------------------------

const STARTERS: Starter[] = [
  {
    slug: "langgraph-python",
    path: "examples/integrations/langgraph-python",
    port: 3000,
    healthPaths: ["/api/health", "/health", "/"],
    agentPath: "/api/copilotkit",
    agentId: "sample_agent",
    chatMessage: "Hello",
    interactions: [
      {
        name: "switch-to-app-mode",
        selector: 'button:has-text("App")',
        expect: {
          type: "visible",
          selector: 'section[aria-label="To Do column"]',
        },
      },
      {
        name: "add-a-task",
        selector: 'button:has-text("Add a task")',
        expect: {
          type: "visible",
          selector: 'button[aria-label="Delete todo"]',
        },
      },
      {
        name: "switch-to-chat-mode",
        selector: 'button:has-text("Chat")',
        expect: { type: "visible", selector: "textarea" },
      },
    ],
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

  test("@health — health endpoint responds OK", async ({ request }) => {
    const result = await checkHealth(
      request,
      STARTER_URL,
      activeStarter!.healthPaths,
    );
    expect(result.ok, `Health check failed: ${result.body}`).toBe(true);
  });

  test("@agent — agent endpoint is reachable", async ({ request }) => {
    const result = await checkAgentEndpoint(
      request,
      STARTER_URL,
      activeStarter!.agentPath,
      activeStarter!.agentId,
    );
    expect(result.status, "Agent endpoint returned 404").not.toBe(404);
    expect(result.ok, `Agent check failed: ${result.body}`).toBe(true);
  });

  test("@chat — chat message gets a response", async ({ page }) => {
    test.slow();
    const result = await sendChatMessage(
      page,
      STARTER_URL,
      activeStarter!.chatMessage,
    );
    expect(result.gotResponse, "No assistant response received").toBe(true);
    expect(result.responseText.length).toBeGreaterThan(0);
  });

  test("@interaction — UI interactions work without errors", async ({
    page,
  }) => {
    test.slow();
    const { getErrors } = setupConsoleErrorCollector(page);

    await page.goto(STARTER_URL, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    for (const interaction of activeStarter!.interactions) {
      const element = page.locator(interaction.selector).first();
      await element.waitFor({ state: "visible", timeout: 10_000 });
      await element.click();
      await page.waitForTimeout(1_000);

      if (interaction.expect.type === "visible") {
        await expect(
          page.locator(interaction.expect.selector).first(),
        ).toBeVisible({ timeout: 10_000 });
      } else if (interaction.expect.type === "count-increased") {
        const count = await page
          .locator(interaction.expect.selector)
          .count();
        expect(count).toBeGreaterThan(0);
      }
      // "no-error" — checked at the end via console errors
    }

    const errors = getErrors().filter(
      (e) => !e.includes("favicon") && !e.includes("net::ERR_"),
    );
    expect(errors, "Unexpected console errors").toEqual([]);
  });
});
