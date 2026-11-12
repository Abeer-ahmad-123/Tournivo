import { test, expect } from "@playwright/test";
const appOrigin = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
test("organizer creates a real workspace, persists a draft, generates fixtures and records a score", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const token = Date.now();
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Your name").fill("Alex Organizer");
  await page.getByLabel("Email address").fill(`e2e-${token}@test.invalid`);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill(`Tournivo-${token}-secure`);
  await page.getByRole("button", { name: "Create your account", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Alex/ })).toBeVisible();
  await page.getByRole("button", { name: "Set up workspace" }).click();
  await page.getByLabel("Organization name").fill(`Summit Sports ${token}`);
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(page.getByText("Your workspace is ready.")).toBeVisible();
  await page.getByRole("button", { name: "Create tournament", exact: true }).click();
  await page.getByLabel("Tournament name").fill(`Autumn Champions Cup ${token}`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Entrant names — one per line")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "About Single elimination", exact: true }).click();
  await expect(
    page.getByText("8 entrants → 4 quarterfinals → 2 semifinals → 1 final."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).last().click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: `Autumn Champions Cup ${token}` })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Tournaments", exact: false }).first().click();
  await page.getByRole("button", { name: new RegExp(`Autumn Champions Cup ${token}`) }).click();
  await page.getByRole("button", { name: "Continue setup", exact: true }).click();
  await page.getByRole("button", { name: /Review & generate/ }).click();
  await page.getByRole("button", { name: "Generate tournament", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Fixtures & results", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("7 competitive matches", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Enter result" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("spinbutton").first().fill("2");
  await dialog.getByRole("spinbutton").nth(1).fill("0");
  await dialog.getByRole("button", { name: "Confirm result" }).click();
  await expect(page.getByText("1 completed · 3 ready to play")).toBeVisible();
  await page.getByRole("tab", { name: "Bracket", exact: true }).click();
  await expect(page.getByText("The road to the title")).toBeVisible();
  await page.screenshot({ path: ".local/tournament-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({
    path: ".local/tournament-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("tab", { name: "Rulebook", exact: true }).click();
  await page.getByRole("button", { name: "Build rulebook", exact: true }).click();
  await page.getByLabel("Rule title", { exact: true }).fill("Registered entrants only");
  await page
    .getByLabel("Detailed description")
    .fill("Entrants must meet the published eligibility requirements before taking part.");
  await page
    .getByLabel("Violation conditions")
    .fill("An unregistered entrant participates in an official fixture.");
  await page
    .getByLabel("Evidence requirements")
    .fill("A signed referee report with the match reference.");
  await page.getByLabel("Penalty", { exact: true }).selectOption("team-disqualification");
  await page.getByRole("button", { name: "Publish version 1", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registered entrants only" })).toBeVisible();
  await page.getByRole("button", { name: "Acknowledge version 1" }).click();
  await expect(page.getByText("Acknowledged", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Disciplinary center", exact: true }).click();
  await page.getByRole("button", { name: "Report a violation", exact: true }).click();
  await page.getByLabel("Case title").fill("Eligibility review");
  await page
    .getByLabel("Report details")
    .fill("An entrant may have participated without the required registration.");
  await page.getByRole("button", { name: "Submit report", exact: true }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByLabel("Attach evidence").setInputFiles({
    name: "referee-report.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      "%PDF-1.4\nA private referee report fixture for upload verification.\n%%EOF",
    ),
  });
  await page.getByRole("button", { name: "Upload private evidence" }).click();
  await expect(page.getByRole("link", { name: /application\/pdf/ })).toBeVisible();
  const evidenceUrl = await page
    .getByRole("link", { name: /application\/pdf/ })
    .getAttribute("href");
  const evidenceResponse = await page.context().request.get(evidenceUrl!);
  expect(evidenceResponse.status()).toBe(200);
  expect(evidenceResponse.headers()["content-disposition"]).toContain("attachment");
  await page.getByRole("button", { name: "Under Review", exact: true }).click();
  await page.getByRole("button", { name: "Decision Pending", exact: true }).click();
  await page
    .getByLabel("Decision explanation")
    .fill("The signed referee report confirms the published eligibility breach.");
  await page.getByLabel(/I explicitly confirm/).check();
  await page.getByRole("button", { name: "Apply decision", exact: true }).click();
  await expect(page.getByText("Decision applied once and recorded.")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Publish tournament", exact: true }).click();
  const publicHref = await page
    .getByRole("link", { name: "View public page" })
    .getAttribute("href");
  const publicPage = await browser.newPage(); // A separate context verifies unauthenticated access.
  await publicPage.goto(new URL(publicHref!, appOrigin).href);
  await expect(
    publicPage.getByRole("heading", { name: `Autumn Champions Cup ${token}` }),
  ).toBeVisible();
  await expect(publicPage.getByText("Eligibility review", { exact: true })).toHaveCount(0);
  await publicPage.getByRole("tab", { name: "Published rulebook" }).click();
  await expect(publicPage.getByRole("heading", { name: "Registered entrants only" })).toBeVisible();
});
test("anonymous API reads and cross-origin mutations are rejected", async ({ request }) => {
  expect((await request.get("/api/workspace")).status()).toBe(401);
  expect(
    (await request.get("/api/evidence?id=00000000-0000-4000-8000-000000000000")).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/workspace", {
        headers: { origin: "https://untrusted.invalid" },
        data: { action: "organization.create", name: "Untrusted" },
      })
    ).status(),
  ).toBe(403);
});

test("generation failures keep one saved draft across retries", async ({ page }) => {
  test.setTimeout(120000);
  const token = Date.now();
  const api = page.context().request;
  const headers = { origin: appOrigin };
  const signup = await api.post("/api/auth/sign-up/email", {
    headers,
    data: {
      name: "Draft Organizer",
      email: `retry-${token}@test.invalid`,
      password: `Tournivo-${token}-secure`,
    },
  });
  expect(signup.status()).toBe(200);
  const organization = await api.post("/api/workspace", {
    headers,
    data: { action: "organization.create", name: `Retry club ${token}` },
  });
  expect(organization.status()).toBe(200);
  await page.goto("/");
  await page.getByRole("button", { name: "Create tournament", exact: true }).click();
  await page.getByLabel("Tournament name").fill(`Roster constraint ${token}`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Minimum roster", { exact: true }).fill("10");
  await page.getByRole("button", { name: /Review & generate/ }).click();
  for (let i = 0; i < 2; i++) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/workspace") &&
        response.request().method() === "POST" &&
        response.request().postDataJSON()?.action === "tournament.generate",
    );
    await page.getByRole("button", { name: "Generate tournament", exact: true }).click();
    expect((await responsePromise).status()).toBe(422);
    await expect(
      page.getByRole("button", { name: "Generate tournament", exact: true }),
    ).toBeEnabled();
  }
  const workspace = await (await api.get("/api/workspace")).json();
  expect(workspace.tournaments).toHaveLength(1);
  expect(workspace.tournaments[0].status).toBe("draft");
  expect(workspace.tournaments[0].revision).toBe(1);
});
