import { test, expect } from "@playwright/test";
const promo = "22222222-2222-4222-8222-222222222222";
const imageUrl = "https://images.example.test/promo.svg";
test("contenu éditable, aperçu externe borné sans référent et URL conservée après échec", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let content = {
    id: promo,
    store: "Acme synthétique",
    code: "MiXeD-20",
    publicationStatus: "masked",
    articleDescription: "Description <b>échappée</b>",
    articleImage: imageUrl,
  };
  let sent;
  await page.route("**/office-api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data = [];
    if (path.endsWith("/csrf"))
      data = { token: "synthetic-csrf", headerName: "X-CSRF-TOKEN" };
    else if (path.endsWith("/session")) data = { username: "francois-test" };
    else if (path.endsWith("/content")) {
      sent = request.postDataJSON();
      content = { ...content, ...sent };
      data = content;
    } else if (path.endsWith(`/promos/${promo}`)) data = content;
    else if (path.endsWith("/promos")) data = { items: [content], total: 1 };
    await route.fulfill({ status: 200, json: data });
  });
  let imageHeaders;
  await page.route(imageUrl, async (route) => {
    imageHeaders = await route.request().allHeaders();
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1200"><rect width="2400" height="1200" fill="#246"/></svg>',
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/offres?promoId=${promo}`);
  const editor = page.getByRole("region", { name: "Contenu de l’offre" });
  await expect(editor.locator(".promo-description")).toBeVisible();
  expect(await editor.locator("b").count()).toBe(0);
  const image = editor.getByRole("img", { name: "Aperçu de l’article" });
  await image.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      image.evaluate((node) => node.complete && node.naturalWidth > 0),
    )
    .toBe(true);
  expect(imageHeaders.referer).toBeUndefined();
  await expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
  const size = await image.boundingBox();
  expect(size.height).toBeLessThanOrEqual(240);
  expect(size.width).toBeLessThanOrEqual(320);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const form = editor.getByRole("form", {
    name: "Modifier le contenu de l’offre",
  });
  await form
    .getByLabel("Description de l’article")
    .fill("Contenu navigateur revu");
  const badImage = `https://images.example.test/${"x".repeat(500)}.png`;
  await page.route(badImage, (route) => route.abort());
  await form.getByLabel("Image de l’article (URL)").fill(badImage);
  await form.getByRole("button", { name: "Enregistrer le contenu" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Je confirme cette opération")
    .check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmer" })
    .click();
  await expect(form.getByText(/Contenu enregistré/)).toBeVisible();
  expect(sent).toEqual({
    articleDescription: "Contenu navigateur revu",
    articleImage: badImage,
  });
  await expect(
    editor.getByText("Aperçu indisponible. L’URL reste consultable."),
  ).toBeVisible();
  await expect(editor.getByText(badImage, { exact: true })).toBeVisible();
  expect(
    await editor
      .getByText(badImage, { exact: true })
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await editor.screenshot({
    path: "docs/evidence/promo-content-mobile-synthetic.png",
  });
  expect(errors).toEqual([]);
});
