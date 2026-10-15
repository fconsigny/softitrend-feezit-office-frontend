import { it, expect } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, owner, response } from "./http.js";

function setup(hash = "#/comptes") {
  window.location.hash = hash;
  const http = httpBoundary((url) => {
    if (url.includes("/accounts?"))
      return response(200, {
        items: [
          {
            id: owner,
            username: "draft",
            name: "constructor",
            visibility: "absent",
            banned: false,
          },
        ],
        total: 1,
      });
    if (url.endsWith("/moderation"))
      return response(200, [
        { REASON: "sent", DOSSIER_REFERENCE: "2026-10-12" },
      ]);
  });
  render(<App client={createOfficeClient(http)} />);
  return http;
}

it.each([
  [
    "Réserver une offre",
    "Préparer une réservation",
    "Compte propriétaire (UUID)",
  ],
  [
    "Statistiques du compte",
    "Consulter les statistiques",
    "Compte propriétaire (UUID)",
  ],
  ["Ajouter à l’attente", "Ajouter à l’attente", "Compte propriétaire (UUID)"],
  ["Examiner le dossier", "Consulter un dossier", "Compte à consulter (UUID)"],
])(
  "relie %s au bon compte sans copier son UUID",
  async (link, formName, label) => {
    setup();
    const list = within(
      await screen.findByRole("region", { name: "Répertoire des comptes" }),
    );
    await userEvent.click(await list.findByRole("link", { name: link }));
    const form = within(await screen.findByRole("form", { name: formName }));
    expect(form.getByLabelText(label)).toHaveValue(owner);
    if (link === "Examiner le dossier") {
      const dossier = within(
        await screen.findByRole("region", { name: "Dossier interne" }),
      );
      expect(await dossier.findByText("sent")).toBeInTheDocument();
      expect(dossier.getByText("2026-10-12")).toBeInTheDocument();
    }
  },
);

it("recherche un compte interne avant réservation sans utiliser le catalogue public", async () => {
  const http = setup("#/offres");
  const search = within(
    await screen.findByRole("region", { name: "Trouver le compte à réserver" }),
  );
  await userEvent.type(search.getByLabelText("Rechercher"), "constructor");
  await userEvent.click(search.getByRole("button", { name: "Rechercher" }));
  await waitFor(() =>
    expect(http.mock.calls.some(([url]) => url.endsWith("q=constructor"))).toBe(
      true,
    ),
  );
  await userEvent.click(
    await search.findByRole("link", { name: "Choisir ce compte" }),
  );
  const form = within(
    await screen.findByRole("form", { name: "Préparer une réservation" }),
  );
  expect(form.getByLabelText("Compte propriétaire (UUID)")).toHaveValue(owner);
  expect(http.mock.calls.some(([url]) => url.includes("/api/creators"))).toBe(
    false,
  );
  expect(
    screen.getByText(/liste des offres.*tous les comptes/i),
  ).toBeInTheDocument();
});

it.each([
  "constructor",
  `${owner}/stats`,
  ` ${owner}`,
  `${owner}&ownerId=${owner}`,
])(
  "refuse le contexte non canonique/ambigu %s sans réparer la valeur",
  async (invalid) => {
    const value = invalid.includes("&") ? invalid : encodeURIComponent(invalid);
    const http = setup(`#/moderation?ownerId=${value}`);
    const form = within(
      await screen.findByRole("form", { name: "Consulter un dossier" }),
    );
    expect(form.getByLabelText("Compte à consulter (UUID)")).toHaveValue("");
    expect(
      http.mock.calls.some(([url]) => /accounts\/.+\/moderation/.test(url)),
    ).toBe(false);
  },
);
