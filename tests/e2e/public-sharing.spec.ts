import { expect, test } from "@playwright/test";
import { signUpRespectingRateLimit } from "./helpers";

test("shares a tournament without login, follows live results, and revokes spectator access", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  const token = crypto.randomUUID(),
    headers = { origin: new URL(baseURL!).origin };
  const request = page.context().request;
  const signup = await signUpRespectingRateLimit(() =>
    request.post("/api/auth/sign-up/email", {
      headers,
      data: {
        name: "Sharing Organizer",
        email: `share-${token}@test.invalid`,
        password: `Tournivo-${token}-secure`,
      },
    }),
  );
  expect(signup.status()).toBe(200);
  const org = await request.post("/api/workspace", {
    headers,
    data: { action: "organization.create", name: `Sharing club ${token}` },
  });
  expect(org.status()).toBe(200);
  const organizationId = (await org.json()).id;
  const name = `Shared Foosball Cup ${token.slice(0, 6)}`;
  const saved = await request.post("/api/workspace", {
    headers,
    data: {
      action: "tournament.save",
      organizationId,
      expectedRevision: 0,
      draft: {
        name,
        sportId: "foosball",
        entrantNames: ["Red", "Blue", "Gold", "Green"],
        roster: {},
      },
    },
  });
  expect(saved.status()).toBe(200);
  const tournamentId = (await saved.json()).id;
  const workspace = async () => (await request.get("/api/workspace")).json();
  const command = async (data: Record<string, unknown>) => {
    const w = await workspace(),
      t = w.tournaments.find((row: { id: string }) => row.id === tournamentId);
    const response = await request.post("/api/workspace", {
      headers,
      data: { organizationId, tournamentId, expectedRevision: t.revision, ...data },
    });
    expect(response.status()).toBe(200);
  };
  const openTournament = async () => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: /^Tournaments/ })
      .click();
    await page.locator(".tournament-row").filter({ hasText: name }).click();
  };
  await openTournament();
  await expect(page.getByRole("button", { name: "Share tournament", exact: true })).toHaveCount(0);
  await command({ action: "tournament.generate", idempotencyKey: crypto.randomUUID() });
  await openTournament();
  await page.getByRole("button", { name: "Share tournament", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share tournament", exact: true });
  await expect(dialog.getByText(/without logging in/)).toBeVisible();
  await dialog.getByRole("button", { name: "Enable public link", exact: true }).click();
  const input = dialog.getByLabel("Public tournament link", { exact: true });
  await expect(input).toHaveAttribute("readonly", "");
  const url = await input.inputValue();
  expect(new URL(url).origin).toBe(new URL(baseURL!).origin);
  expect(new URL(url).pathname).toMatch(/^\/t\/shared-foosball-cup-/);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await dialog.getByRole("button", { name: "Copy link", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await dialog.getByRole("button", { name: "Close dialog" }).click();

  const anonymous = await browser.newContext({ baseURL });
  try {
    const viewer = await anonymous.newPage();
    await viewer.clock.install();
    await viewer.goto(url);
    await expect(viewer.getByRole("heading", { name, exact: true })).toBeVisible();
    const progress = viewer.getByRole("region", { name: "Tournament progress" });
    await expect(progress.getByText("0 / 3", { exact: true })).toBeVisible();
    await expect(progress.getByText("0% complete", { exact: true })).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
    expect((await anonymous.request.get("/api/workspace")).status()).toBe(401);
    const api = `/api/public/tournaments/${new URL(url).pathname.split("/").at(-1)}`;
    const publicResponse = await anonymous.request.get(api);
    expect(publicResponse.status()).toBe(200);
    expect(publicResponse.headers()["cache-control"]).toBe("no-store");
    expect(JSON.stringify(await publicResponse.json())).not.toMatch(
      /reportedBy|objectKey|organizationId|createdBy|refereeId|email/,
    );
    expect((await anonymous.request.post(api, { data: {} })).status()).toBe(405);

    const scoreNext = async () => {
      const w = await workspace();
      const match = w.matches.find(
        (row: { tournamentId: string; status: string }) =>
          row.tournamentId === tournamentId && row.status === "ready",
      );
      await command({
        action: "match.result",
        matchId: match.id,
        scores: [2, 0],
        idempotencyKey: crypto.randomUUID(),
      });
    };
    const poll = async () => {
      const response = viewer.waitForResponse((r) => r.url().includes(api));
      await viewer.clock.runFor(15000);
      await response;
    };
    await viewer.getByRole("tab", { name: "Bracket", exact: true }).click();
    await scoreNext();
    await poll();
    await expect(progress.getByText("1 / 3", { exact: true })).toBeVisible();
    await expect(progress.getByText("33% complete", { exact: true })).toBeVisible();
    await expect(viewer.getByRole("tab", { name: "Bracket", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // A transient network failure retains the last confirmed results and can be retried.
    await viewer.route(`**${api}`, (route) =>
      route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } }),
    );
    await progress.getByRole("button", { name: "Refresh progress", exact: true }).click();
    await expect(progress.getByText(/Couldn’t update/)).toBeVisible();
    await expect(progress.getByText("1 / 3", { exact: true })).toBeVisible();
    await viewer.unroute(`**${api}`);
    await progress.getByRole("button", { name: "Refresh progress", exact: true }).click();
    await expect(progress.getByText(/Couldn’t update/)).toHaveCount(0);

    await scoreNext();
    await scoreNext();
    await poll();
    await expect(progress.getByText("3 / 3", { exact: true })).toBeVisible();
    await expect(progress.getByText("Tournament complete", { exact: true })).toBeVisible();
    await expect(
      progress.getByRole("progressbar", { name: "Tournament completion" }),
    ).toHaveJSProperty("value", 100);
    await expect(viewer.locator(".public-champion h2")).toBeVisible();
    await viewer.setViewportSize({ width: 2560, height: 1000 });
    await expect(viewer.locator(".public-content")).toHaveJSProperty("clientWidth", 2560);
    await viewer.setViewportSize({ width: 390, height: 844 });
    await expect(viewer.locator("body")).toHaveJSProperty("scrollWidth", 390);
    await viewer.screenshot({
      path: ".local/public-progress-mobile.png",
      fullPage: true,
      animations: "disabled",
    });

    await command({ action: "tournament.publish", visibility: "private" });
    expect((await anonymous.request.get(api)).status()).toBe(404);
    await poll();
    await expect(
      viewer.getByRole("heading", { name: "This tournament isn’t available." }),
    ).toBeVisible();
    await expect(progress).toHaveCount(0);
    await command({ action: "tournament.publish", visibility: "public" });
    await viewer.reload();
    await expect(progress.getByText("3 / 3", { exact: true })).toBeVisible();
    await command({
      action: "tournament.delete",
      confirmationName: name,
      idempotencyKey: crypto.randomUUID(),
    });
    await poll();
    await expect(
      viewer.getByRole("heading", { name: "This tournament isn’t available." }),
    ).toBeVisible();
    expect((await anonymous.request.get(api)).status()).toBe(404);
  } finally {
    await anonymous.close();
  }
});
