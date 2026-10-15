import { it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, owner, promo, response } from "./http.js";

it("affiche les totaux serveurs même avec une seule ligne et ouvre la file réelle", async () => {
  const http = httpBoundary((url) => {
    if (url.includes("/accounts?"))
      return response(200, { items: [{ id: owner }], total: 427 });
    if (url.includes("/promos?"))
      return response(200, { items: [{ id: promo }], total: 183 });
    if (url.includes("/incidents?"))
      return response(200, {
        items: [{ promoId: promo, ownerId: owner }],
        total: 29,
      });
    if (url.includes("/outbox-page?"))
      return response(200, {
        items: [{ id: promo, deliveryStatus: "pending" }],
        total: 250,
      });
  });
  render(<App client={createOfficeClient(http)} />);
  for (const [name, total] of [
    ["Comptes · tous états", "427"],
    ["Offres · tous états", "183"],
    ["Procédures ouvertes · total", "29"],
  ]) {
    const metric = within(await screen.findByRole("region", { name }));
    expect(await metric.findByText(total)).toBeInTheDocument();
  }
  expect(
    screen.getByText(/publics, masqués, sans profil et bannis/i),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/brouillons, publiées et masquées/i),
  ).toBeInTheDocument();
  const list = within(
    screen.getByRole("region", { name: "Notifications · tous états" }),
  );
  expect(await list.findByText(/250 résultats/)).toBeInTheDocument();
  expect(list.getByText("En attente d’émission")).toBeInTheDocument();
  expect(http.mock.calls.some(([url]) => url.endsWith("/outbox"))).toBe(false);
  await userEvent.click(
    screen.getByRole("link", { name: "Retrouver un créateur" }),
  );
  expect(
    await screen.findByRole("region", { name: "Répertoire des comptes" }),
  ).toBeInTheDocument();
});

it("ne remplace pas une lecture de compteur indisponible par zéro", async () => {
  render(
    <App
      client={createOfficeClient(
        httpBoundary((url) =>
          url.includes("/accounts?") ? response(502, {}) : undefined,
        ),
      )}
    />,
  );
  const metric = within(
    await screen.findByRole("region", { name: "Comptes · tous états" }),
  );
  expect(await metric.findByText("Indisponible")).toBeInTheDocument();
  expect(metric.queryByText("0")).not.toBeInTheDocument();
  expect(
    await within(
      screen.getByRole("region", { name: "Offres · tous états" }),
    ).findByText("0"),
  ).toBeInTheDocument();
});
