import { test, expect } from "@playwright/test";
const owner = "11111111-1111-4111-8111-111111111111";
const promo = "22222222-2222-4222-8222-222222222222";
// Fixtures exclusively at the HTTP boundary of browser tests, never bundled.
async function boundary(page) {
  await page.route("**/office-api/**", async (route) => {
    const url = new URL(route.request().url());
    let data;
    if (url.pathname.endsWith("/csrf"))
      data = { token: "synthetic-csrf", headerName: "X-CSRF-TOKEN" };
    else if (url.pathname.endsWith("/session"))
      data = { username: "francois-test" };
    else if (url.pathname.endsWith("/incidents"))
      data = {
        items: [
          {
            promoId: promo,
            ownerId: owner,
            kind: "report",
            openedAt: "2026-10-01T12:00:00Z",
            firstSentAt: null,
          },
        ],
        total: 1,
        page: 0,
        size: 20,
      };
    else if (url.pathname.endsWith("/accounts"))
      data = {
        items: [
          {
            id: owner,
            username: "alice-test",
            name: "Alice · test",
            banned: false,
            visibility: "public",
          },
        ],
        total: 1,
        page: 0,
        size: 20,
      };
    else if (url.pathname.endsWith("/promos"))
      data = {
        items: [
          {
            id: promo,
            ownerId: owner,
            store: "Acme · synthétique",
            code: "mIxEd-20",
            articleName: "Collection test",
            publicationStatus: "draft",
            status: "upcoming",
            endDate: null,
          },
        ],
        total: 1,
        page: 0,
        size: 20,
      };
    else if (url.pathname.endsWith("/outbox"))
      data = [
        {
          ID: promo,
          OWNER_ID: owner,
          KIND: "report_received",
          RECIPIENT: "synthetic@example.com",
          DELIVERY_STATUS: "pending",
          CREATED_AT: "2026-10-01T12:00:00Z",
          SENT_AT: null,
        },
      ];
    else data = [];
    await route.fulfill({ status: 200, json: data });
  });
}
for (const [name, viewport] of [
  ["desktop", { width: 1280, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  test(`navigation complète et formulaires accessibles · ${name}`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await boundary(page);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Tableau de bord", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("En attente d’émission", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `docs/evidence/dashboard-${name}-synthetic.png`,
      fullPage: true,
    });
    for (const label of [
      "Comptes",
      "Offres & réservations",
      "Marques & alias",
      "Liste d’attente",
      "Modération",
      "Statistiques",
      "Notifications",
    ]) {
      await page
        .getByRole("navigation")
        .getByRole("link", { name: label, exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: label, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Offres & réservations", exact: true })
      .click();
    await page.getByLabel("Compte propriétaire (UUID)").fill("malformed");
    await page
      .getByRole("button", { name: "Préparer une réservation", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.screenshot({
      path: `docs/evidence/reservation-${name}-synthetic.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}
