import { test, expect } from "@playwright/test";

const promo = "22222222-2222-4222-8222-222222222222";
const owner = "11111111-1111-4111-8111-111111111111";

test("contenu littéral et URL de 2048 caractères en création et édition", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let content = {
    id: promo,
    store: "Acme",
    code: "MiXeD",
    publicationStatus: "draft",
    articleDescription: "__proto__",
    articleImage: "",
  };
  const mutations = [];
  await page.route("https://images.example.test/**", (route) => route.abort());
  await page.route("**/office-api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data = [];
    if (path.endsWith("/csrf"))
      data = { token: "synthetic-csrf", headerName: "X-CSRF-TOKEN" };
    else if (path.endsWith("/session"))
      data = { username: "synthetic-operator" };
    else if (path.endsWith("/content") || path.endsWith("/reservations")) {
      const payload = request.postDataJSON();
      mutations.push({ path, payload });
      content = { ...content, ...payload };
      data = content;
    } else if (path.endsWith(`/promos/${promo}`)) data = content;
    else if (path.endsWith("/promos")) data = { items: [content], total: 1 };
    await route.fulfill({ status: 200, json: data });
  });
  await page.goto(`/#/offres?promoId=${promo}`);
  const table = page.getByRole("table").first();
  for (const literal of [
    "__proto__",
    "constructor",
    "draft",
    "2026-10-12",
    "2026-10-12T12:00:00Z",
  ]) {
    content = {
      ...content,
      articleDescription: literal,
      articleImage: literal,
    };
    await page.getByRole("button", { name: "Actualiser" }).click();
    await expect(
      table.getByRole("cell", { name: literal, exact: true }),
    ).toHaveCount(2);
    await expect(
      table.getByRole("cell", { name: "Brouillon", exact: true }),
    ).toBeVisible();
  }
  const prefix = "https://images.example.test/";
  const imageUrl = prefix + "x".repeat(2048 - prefix.length);
  async function confirm() {
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Je confirme cette opération").check();
    await dialog.getByRole("button", { name: "Confirmer" }).click();
  }
  const reservation = page.getByRole("form", {
    name: "Préparer une réservation",
  });
  const values = {
    "Compte propriétaire (UUID)": owner,
    Marque: "Acme",
    Code: "MiXeD",
    Article: "Article",
    Catégorie: "Mode",
    Destination: "https://example.test/offer",
    "Accord reçu le (UTC)": "2026-10-01T12:00",
    "Référence de l’accord": "synthetic-email",
    "Version des documents": "0.1",
    "Image de l’article (URL)": imageUrl,
  };
  for (const [label, value] of Object.entries(values))
    await reservation.getByLabel(label, { exact: true }).fill(value);
  await expect(reservation.getByLabel("Image de l’article (URL)")).toHaveValue(
    imageUrl,
  );
  await reservation
    .getByRole("button", { name: "Préparer une réservation" })
    .click();
  await confirm();
  await expect(
    reservation.getByText(/Réservation préparée en brouillon/),
  ).toBeVisible();
  expect(mutations[0].payload.articleImage).toBe(imageUrl);
  const editor = page.getByRole("form", {
    name: "Modifier le contenu de l’offre",
  });
  await editor.getByLabel("Image de l’article (URL)").fill(imageUrl);
  await editor.getByLabel("Description de l’article").fill("__proto__");
  await editor.getByRole("button", { name: "Enregistrer le contenu" }).click();
  await confirm();
  await expect(editor.getByText(/Contenu enregistré/)).toBeVisible();
  expect(mutations[1].payload).toEqual({
    articleDescription: "__proto__",
    articleImage: imageUrl,
  });
  await expect(
    table.getByRole("cell", { name: "__proto__", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
