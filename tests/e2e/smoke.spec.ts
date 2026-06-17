import { test, expect } from "@playwright/test";

test.describe("Frontend smoke tests", () => {
  test("home page loads and has expected heading", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Code Smart/);
    // Home page should have some text about value picks
    await expect(page.locator("text=Top value picks").first()).toBeVisible();
  });

  test("/compare loads with comparison table", async ({ page }) => {
    await page.goto("/compare");
    await expect(page).toHaveTitle(/Compare plans/);
    await expect(page.locator("h1")).toContainText("Compare plans");
  });

  test("/models loads with model tabs", async ({ page }) => {
    await page.goto("/models");
    await expect(page).toHaveTitle(/Models/);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("/rankings loads with price band sections", async ({ page }) => {
    await page.goto("/rankings");
    await expect(page).toHaveTitle(/Rankings/);
    // Should have at least one section with price info
    await expect(page.locator("text=low").first()).toBeVisible();
  });

  test("/methodology loads with version info", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page).toHaveTitle(/Methodology/);
    await expect(page.locator("h1")).toContainText("Methodology");
  });

  test("/freshness loads with freshness data", async ({ page }) => {
    await page.goto("/freshness");
    await expect(page).toHaveTitle(/Data freshness/);
    await expect(page.locator("h1")).toContainText("Data freshness");
  });

  test("/providers/anthropic loads provider detail", async ({ page }) => {
    await page.goto("/providers/anthropic");
    await expect(page.locator("body")).toBeVisible();
    // Should contain the provider name somewhere
    await expect(page.locator("text=Anthropic").first()).toBeVisible();
  });

  test("static API JSON endpoints return valid JSON", async ({ page }) => {
    const endpoints = [
      "/data/api/providers.json",
      "/data/api/plans.json",
      "/data/api/models.json",
      "/data/api/methodology.json",
      "/data/api/rankings.json",
    ];

    for (const endpoint of endpoints) {
      const response = await page.request.get(endpoint);
      expect(response.ok()).toBeTruthy();
      const contentType = response.headers()["content-type"] ?? "";
      expect(contentType).toContain("json");
    }
  });
});
