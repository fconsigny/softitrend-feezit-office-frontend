import { it, expect } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, owner, promo, response } from "./http.js";
const decision = {
  "Compte propriétaire (UUID)": owner,
  Motif: "Motif vérifié",
  Faits: "Faits documentés",
  Échanges: "Échanges opérateur",
  "Référence dossier": "dossier-test",
};
const cases = [
  [
    "Masquer temporairement",
    decision,
    `accounts/${owner}/moderation`,
    "PUT",
    {
      reason: "Motif vérifié",
      facts: "Faits documentés",
      exchanges: "Échanges opérateur",
      dossierReference: "dossier-test",
    },
    /conserve/i,
  ],
  [
    "Lever le masquage",
    { "Compte propriétaire (UUID)": owner },
    `accounts/${owner}/moderation`,
    "DELETE",
    null,
    /retrait volontaire/i,
  ],
  [
    "Bannir le compte",
    decision,
    `accounts/${owner}/ban`,
    "PUT",
    {
      reason: "Motif vérifié",
      facts: "Faits documentés",
      exchanges: "Échanges opérateur",
      dossierReference: "dossier-test",
    },
    /supprime/i,
  ],
  [
    "Lever le bannissement",
    { "Compte propriétaire (UUID)": owner },
    `accounts/${owner}/ban`,
    "DELETE",
    null,
    /ne restaure/i,
  ],
  [
    "Résoudre le signalement",
    { "Offre (UUID)": promo },
    `promos/${promo}/resolve`,
    "PUT",
    null,
    /complète/i,
  ],
  [
    "Retirer pour fraude établie",
    {
      "Offre (UUID)": promo,
      Motif: "Fraude établie par examen",
      "Référence dossier": "fraude-test",
    },
    `promos/${promo}/fraud-removal`,
    "POST",
    {
      reason: "Fraude établie par examen",
      dossierReference: "fraude-test",
      fraudEstablished: true,
    },
    /sans bannir/i,
  ],
  [
    "Créer un nouveau profil",
    {
      "Compte propriétaire (UUID)": owner,
      Pseudo: "nouveau-test",
      Nom: "Créateur test",
      Biographie: "Nouvelle biographie",
      "Avatar (URL)": "https://example.com/avatar.png",
      Catégorie: "Mode",
    },
    `accounts/${owner}/profile`,
    "POST",
    {
      username: "nouveau-test",
      name: "Créateur test",
      bio: "Nouvelle biographie",
      avatar: "https://example.com/avatar.png",
      category: "Mode",
    },
    /nouveau/i,
  ],
];
it.each(cases)(
  "%s exige une confirmation des conséquences avant la mutation",
  async (title, values, path, method, payload, consequence) => {
    window.location.hash = "#/moderation";
    const http = httpBoundary((url, options) =>
      url.endsWith(path) && options.method === method
        ? response(
            method === "POST" && path.endsWith("/profile") ? 201 : 204,
            {},
          )
        : undefined,
    );
    render(<App client={createOfficeClient(http)} />);
    await screen.findByRole("navigation");
    await userEvent.click(screen.getByText(title, { selector: "summary" }));
    const form = within(screen.getByRole("form", { name: title }));
    for (const [label, value] of Object.entries(values))
      await userEvent.type(form.getByLabelText(label), value);
    await userEvent.click(form.getByRole("button", { name: title }));
    let dialog = within(await screen.findByRole("dialog"));
    expect(
      dialog.getByText(consequence, { selector: "p" }),
    ).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Confirmer" })).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Annuler" }));
    expect(
      http.mock.calls.some(
        ([url, options]) => url.endsWith(path) && options.method === method,
      ),
    ).toBe(false);
    await userEvent.click(form.getByRole("button", { name: title }));
    dialog = within(screen.getByRole("dialog"));
    await userEvent.click(dialog.getByLabelText("Je confirme cette opération"));
    await userEvent.click(dialog.getByRole("button", { name: "Confirmer" }));
    await waitFor(() => expect(form.getByRole("status")).toBeInTheDocument());
    const options = http.mock.calls.find(
      ([url, options]) => url.endsWith(path) && options.method === method,
    )[1];
    expect(options.method).toBe(method);
    expect(options.headers["X-CSRF-TOKEN"]).toBe("csrf-1");
    expect(
      options.body === undefined ? null : JSON.parse(options.body),
    ).toEqual(payload);
  },
);
it("un signalement en erreur upstream n’affiche ni retrait ni succès ni message technique externe", async () => {
  window.location.hash = "#/moderation";
  const http = httpBoundary((url) =>
    url.endsWith("/reports")
      ? response(502, { message: "https://secret.example/?token=SECRET" })
      : undefined,
  );
  render(<App client={createOfficeClient(http)} />);
  await screen.findByRole("navigation");
  await userEvent.click(
    screen.getByText("Signaler un problème", { selector: "summary" }),
  );
  const form = within(
    screen.getByRole("form", { name: "Signaler un problème" }),
  );
  await userEvent.type(form.getByLabelText("Offre (UUID)"), promo);
  await userEvent.type(
    form.getByLabelText("Email du signalant"),
    "synthetic@example.com",
  );
  await userEvent.click(
    form.getByRole("button", { name: "Signaler un problème" }),
  );
  expect(await form.findByRole("alert")).toHaveTextContent(
    "Service Feezit indisponible",
  );
  expect(form.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
  expect(http.mock.calls.some(([url]) => url.endsWith("/fraud-removal"))).toBe(
    false,
  );
});
it("consulte le dossier de modération depuis un identifiant de compte exact", async () => {
  window.location.hash = `#/moderation?ownerId=${owner}`;
  const http = httpBoundary((url, options) =>
    url.endsWith(`accounts/${owner}/moderation`) && options.method === "GET"
      ? response(200, [
          {
            OWNER_ID: owner,
            PHASE: "masked",
            REASON: "Motif du dossier",
            FACTS: "Faits contrôlés",
            EXCHANGES: "Échanges relus",
            DOSSIER_REFERENCE: "DOS-01",
          },
        ])
      : undefined,
  );
  render(<App client={createOfficeClient(http)} />);
  const form = within(
    await screen.findByRole("form", { name: "Consulter un dossier" }),
  );
  expect(form.getByLabelText("Compte à consulter (UUID)")).toHaveValue(owner);
  await userEvent.click(
    form.getByRole("button", { name: "Consulter le dossier" }),
  );
  expect(await screen.findByText("Faits contrôlés")).toBeInTheDocument();
  expect(screen.getByText("DOS-01")).toBeInTheDocument();
});
