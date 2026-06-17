import { test, expect } from "@playwright/test";

/**
 * Tier-4 coverage (Session 11): the /compare page must (1) render usably at a
 * 375px mobile viewport without runaway horizontal overflow, and (2) deep-link
 * its filter + selection state through the URL query.
 */
test.describe("/compare — mobile + deep-linkable filters", () => {
  test("renders at 375px without horizontal body overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/compare");
    await expect(page.locator("h1")).toContainText("Compare plans");

    // The page (outside the table's own scroll container) must not force the
    // whole document wider than the viewport.
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1); // allow sub-pixel rounding
  });

  test("filter state is restored from the URL query", async ({ page }) => {
    await page.goto("/compare?provider=anthropic&band=mid&conf=observed");

    const providerSelect = page.locator("select").nth(0);
    const bandSelect = page.locator("select").nth(1);
    const confSelect = page.locator("select").nth(2);

    await expect(providerSelect).toHaveValue("anthropic");
    await expect(bandSelect).toHaveValue("mid");
    await expect(confSelect).toHaveValue("observed");
  });

  test("changing a filter writes it back to the URL", async ({ page }) => {
    await page.goto("/compare");
    await page.locator("select").nth(1).selectOption("free");
    await expect(page).toHaveURL(/band=free/);
  });

  test("'Differences only' toggle deep-links via diff=1", async ({ page }) => {
    await page.goto("/compare");
    await page.getByText("Differences only").click();
    await expect(page).toHaveURL(/diff=1/);
  });
});
