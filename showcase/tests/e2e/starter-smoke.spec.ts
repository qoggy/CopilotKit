/**
 * E2E smoke tests for Docker-built starter templates.
 *
 * Same test levels as integration-smoke.spec.ts (@health, @agent, @chat)
 * but targeting locally-built Docker containers instead of Railway backends.
 *
 * Targets a running starter container at STARTER_URL (default localhost:3000).
 * The starter is selected by the STARTER env var (default "langgraph-python").
 */

import { test, expect } from "@playwright/test";
import { checkHealth, checkAgentEndpoint, sendChatMessage } from "./helpers";

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
// Tests — same levels as integration-smoke.spec.ts
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
});
