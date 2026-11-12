import { test, expect } from "@playwright/test";
import { signUpRespectingRateLimit } from "./helpers";

test.beforeEach(async ({ page, baseURL }) => {
  const token = crypto.randomUUID();
  const headers = { origin: new URL(baseURL!).origin };
  const response = await signUpRespectingRateLimit(() =>
    page.context().request.post("/api/auth/sign-up/email", {
      headers,
      data: {
        name: "Random Teams Organizer",
        email: `teams-${token}@test.invalid`,
        password: `Tournivo-${token}-secure`,
      },
    }),
  );
  expect(response.status()).toBe(200);
  const organization = await page.context().request.post("/api/workspace", {
    headers,
    data: { action: "organization.create", name: `Random teams club ${token}` },
  });
  expect(organization.status()).toBe(200);
  await page.goto("/");
});

test("previews, reshuffles and saves random teams with persistent balanced rosters", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Teams & players", exact: true }).click();
  await page.getByRole("button", { name: "Generate random teams", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Generate random teams", exact: true });
  await expect(dialog.getByRole("button", { name: "Save teams & players" })).toBeDisabled();
  const names = ["Alex", "Abeer", "Jordan", "Sam", "Taylor", "Morgan", "Charlie"];
  await dialog.getByLabel("Player names", { exact: true }).fill(names.join("\n"));
  await dialog.getByLabel("Number of teams", { exact: true }).fill("3");
  await dialog.getByRole("button", { name: "Generate preview", exact: true }).click();
  await expect(
    dialog.getByRole("region", { name: "Generated team preview" }).getByRole("listitem"),
  ).toHaveCount(7);
  const unpersisted = await (await page.context().request.get("/api/workspace")).json();
  expect(unpersisted.teams).toHaveLength(0);
  await dialog.getByRole("button", { name: "Reshuffle teams", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Save teams & players" })).toBeEnabled();
  const teamNames = await dialog.locator(".random-team-card h4").allTextContents();
  expect(new Set(teamNames).size).toBe(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({
    path: ".local/random-teams-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Save teams & players", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Teams & players", exact: true }).click();
  for (const name of teamNames)
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const persisted = await (await page.context().request.get("/api/workspace")).json();
  expect(persisted.teams).toHaveLength(3);
  expect(persisted.players.map((p: { name: string }) => p.name).sort()).toEqual([...names].sort());
  expect(persisted.rosters).toHaveLength(7);
  expect(
    persisted.teams
      .map(
        (team: { id: string }) =>
          persisted.rosters.filter((r: { teamId: string }) => r.teamId === team.id).length,
      )
      .sort(),
  ).toEqual([2, 2, 3]);
});

test("generates teams inside the wizard and reuses their rosters for a tournament", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Create tournament", exact: true }).click();
  await page.getByLabel("Tournament name").fill("Random Doubles Cup");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Generate random teams", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Generate random teams", exact: true });
  await dialog.getByLabel("Player names", { exact: true }).fill("Alex, Sam, Jordan, Abeer, Taylor");
  await dialog.getByLabel("Split players by").selectOption("team-size");
  await dialog.getByLabel("Maximum players per team", { exact: true }).fill("2");
  await dialog.getByRole("button", { name: "Generate preview", exact: true }).click();
  await expect(dialog.locator(".random-team-card")).toHaveCount(3);
  const teamNames = await dialog.locator(".random-team-card h4").allTextContents();
  await expect(dialog.getByRole("button", { name: "Save teams & players" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Save teams & players" }).click();
  await expect(page.getByLabel("Entrant names — one per line")).toHaveValue(teamNames.join("\n"));
  await page.getByRole("button", { name: /Review & generate/ }).click();
  await page.getByRole("button", { name: "Generate tournament", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Fixtures & results", exact: true }),
  ).toBeVisible();
  const persisted = await (await page.context().request.get("/api/workspace")).json();
  expect(persisted.teams).toHaveLength(3);
  expect(persisted.players).toHaveLength(5);
  expect(persisted.participants).toHaveLength(3);
});
