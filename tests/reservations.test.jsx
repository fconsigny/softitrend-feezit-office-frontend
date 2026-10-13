import { it, expect } from "vitest";
import { render, screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, owner, response, deferred } from "./http.js";
it("réserve seulement après accord et réponse serveur, sans publication, puis restitue le conflit", async () => {
  window.location.hash = "#/offres";
  const pending = deferred();
  const http = httpBoundary((url, options) =>
    url.endsWith("/reservations") && options.method === "POST"
      ? pending.promise
      : undefined,
  );
  render(<App client={createOfficeClient(http)} />);
  const form = within(
    await screen.findByRole("form", { name: "Préparer une réservation" }),
  );
  const values = {
    "Compte propriétaire (UUID)": owner,
    Marque: "Acme",
    Code: "MiXeD-20",
    Article: "Collection",
    "Description de l’article": "Collection détaillée <b>texte</b>",
    "Image de l’article (URL)": "https://example.com/image.jpg",
    Catégorie: "Mode",
    Destination: "https://example.com/offer",
    "Accord reçu le (UTC)": "2026-10-01T12:00",
    "Référence de l’accord": "email-test-01",
    "Version des documents": "0.1",
  };
  for (const [label, value] of Object.entries(values))
    await userEvent.type(form.getByLabelText(label), value);
  await userEvent.click(
    form.getByRole("button", { name: "Préparer une réservation" }),
  );
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByText(/ne publie pas/i)).toBeInTheDocument();
  expect(http.mock.calls.some(([url]) => url.endsWith("/reservations"))).toBe(
    false,
  );
  await userEvent.click(dialog.getByLabelText("Je confirme cette opération"));
  await userEvent.click(dialog.getByRole("button", { name: "Confirmer" }));
  await waitFor(() =>
    expect(http.mock.calls.some(([url]) => url.endsWith("/reservations"))).toBe(
      true,
    ),
  );
  expect(screen.queryByText(/Réservation préparée/)).not.toBeInTheDocument();
  const payload = JSON.parse(
    http.mock.calls.find(([url]) => url.endsWith("/reservations"))[1].body,
  );
  expect(payload).toEqual({
    ownerId: owner,
    store: "Acme",
    code: "MiXeD-20",
    articleName: "Collection",
    articleDescription: "Collection détaillée <b>texte</b>",
    articleImage: "https://example.com/image.jpg",
    category: "Mode",
    destinationUrl: "https://example.com/offer",
    agreementReceivedAt: "2026-10-01T12:00:00.000Z",
    agreementReference: "email-test-01",
    documentVersion: "0.1",
  });
  await act(async () => pending.resolve(response(409, { code: "CONFLICT" })));
  expect(await form.findByRole("alert")).toHaveTextContent("Conflit");
  expect(form.getByLabelText("Code")).toHaveValue("MiXeD-20");
});
it("recherche et pagine les comptes sur le serveur sans afficher les anciennes réponses", async () => {
  window.location.hash = "#/comptes";
  const late = deferred();
  const http = httpBoundary((url) => {
    if (!url.includes("/accounts?")) return undefined;
    if (url.includes("q=ancien")) return late.promise;
    return response(200, {
      items: [
        {
          id: owner,
          username: url.includes("page=1") ? "page-deux" : "francois",
          name: "François",
          visibility: "absent",
          banned: false,
        },
      ],
      total: 21,
      page: url.includes("page=1") ? 1 : 0,
      size: 20,
    });
  });
  render(<App client={createOfficeClient(http)} />);
  await screen.findByText("francois");
  await userEvent.click(screen.getByRole("button", { name: "Page suivante" }));
  await screen.findByText("page-deux");
  const search = screen.getByLabelText("Rechercher");
  await userEvent.type(search, "ancien");
  await userEvent.click(screen.getByRole("button", { name: "Rechercher" }));
  await userEvent.clear(search);
  await userEvent.type(search, "nouveau");
  await userEvent.click(screen.getByRole("button", { name: "Rechercher" }));
  await screen.findByText("francois");
  await act(async () =>
    late.resolve(
      response(200, {
        items: [{ id: owner, username: "ANCIENNE DONNÉE" }],
        total: 1,
      }),
    ),
  );
  expect(screen.queryByText("ANCIENNE DONNÉE")).not.toBeInTheDocument();
  expect(
    http.mock.calls.some(([url]) => url.includes("page=0&size=20&q=nouveau")),
  ).toBe(true);
  expect(screen.getByText("Sans profil")).toBeInTheDocument();
});
