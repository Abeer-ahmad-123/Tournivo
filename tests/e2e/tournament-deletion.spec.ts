import { expect, test } from "@playwright/test";
import { signUpRespectingRateLimit } from "./helpers";

for (const generated of [false, true]) {
  test(`confirms deletion of a ${generated ? "generated public tournament" : "draft"} and keeps it deleted after reload`, async ({
    page,
    baseURL,
  }) => {
    const token = crypto.randomUUID(),
      headers = { origin: new URL(baseURL!).origin };
    const request = page.context().request;
    const signUp = () =>
      request.post("/api/auth/sign-up/email", {
        headers,
        data: {
          name: "Deletion Organizer",
          email: `delete-${token}@test.invalid`,
          password: `Tournivo-${token}-secure`,
        },
      });
    const signup = await signUpRespectingRateLimit(signUp);
    expect(signup.status()).toBe(200);
    const organization = await request.post("/api/workspace", {
      headers,
      data: { action: "organization.create", name: `Deletion club ${token}` },
    });
    expect(organization.status()).toBe(200);
    const organizationId = (await organization.json()).id;
    const name = generated ? "Public Foosball Cup" : "Draft Foosball Cup";
    const saved = await request.post("/api/workspace", {
      headers,
      data: {
        action: "tournament.save",
        organizationId,
        expectedRevision: 0,
        draft: { name, sportId: "foosball", entrantNames: ["Red", "Blue"], roster: {} },
      },
    });
    expect(saved.status()).toBe(200);
    const tournamentId = (await saved.json()).id;
    if (generated) {
      const fixtures = await request.post("/api/workspace", {
        headers,
        data: {
          action: "tournament.generate",
          organizationId,
          tournamentId,
          expectedRevision: 0,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      expect(fixtures.status()).toBe(200);
      const publish = await request.post("/api/workspace", {
        headers,
        data: {
          action: "tournament.publish",
          organizationId,
          tournamentId,
          expectedRevision: 1,
          visibility: "public",
        },
      });
      expect(publish.status()).toBe(200);
    }
    const before = await (await request.get("/api/workspace")).json();
    const tournament = before.tournaments.find((t: { id: string }) => t.id === tournamentId);
    if (generated) expect((await request.get(`/t/${tournament.slug}`)).status()).toBe(200);
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: /^Tournaments/ })
      .click();
    await page.locator(".tournament-row").filter({ hasText: name }).click();
    await page.getByRole("button", { name: "Delete tournament", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Delete tournament", exact: true });
    const confirm = dialog.getByRole("button", { name: "Delete tournament", exact: true });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("Tournament name to confirm").fill("Wrong tournament");
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    if (generated) await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Delete tournament", exact: true }).click();
    await dialog.getByLabel("Tournament name to confirm").fill(name);
    await expect(confirm).toBeEnabled();
    if (generated) {
      await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
      await page.screenshot({
        path: ".local/tournament-deletion-mobile.png",
        fullPage: true,
        animations: "disabled",
      });
    }
    await confirm.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".tournament-row")).toHaveCount(0);
    await page.reload();
    const after = await (await request.get("/api/workspace")).json();
    expect(after.tournaments).toHaveLength(0);
    expect(after.matches).toHaveLength(0);
    expect(after.participants).toHaveLength(0);
    expect(after.teams).toEqual(before.teams);
    expect((await request.get(`/api/workspace?tournamentId=${tournamentId}`)).status()).toBe(404);
    // Next.js may stream the loading shell with status 200 before rendering notFound().
    await page.goto(`/t/${tournament.slug}`);
    await expect(
      page.getByRole("heading", { name: "This tournament isn’t available." }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
  });
}
