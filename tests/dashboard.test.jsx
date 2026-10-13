import { it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, owner, promo, response } from "./http.js";
it("présente un tableau opérationnel alimenté par les procédures et l’outbox, sans KPI extrapolé", async () => {
  const http = httpBoundary((url) => {
    if (url.includes("/incidents?"))
      return response(200, {
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
      });
    if (url.endsWith("/outbox"))
      return response(200, [
        {
          ID: promo,
          KIND: "report_received",
          DELIVERY_STATUS: "pending",
          SENT_AT: null,
        },
      ]);
  });
  render(<App client={createOfficeClient(http)} />);
  expect(
    await screen.findByRole("link", { name: "Préparer un accord" }),
  ).toBeInTheDocument();
  expect(await screen.findByText("En attente d’émission")).toBeInTheDocument();
  expect(screen.getByText("report")).toBeInTheDocument();
  expect(screen.getByText(/aucun KPI global extrapolé/i)).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("link", { name: "Préparer un accord" }),
  );
  expect(
    await screen.findByRole("form", { name: "Préparer une réservation" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Offres & réservations" }),
  ).toHaveAttribute("aria-current", "page");
});
it("ajoute une attente avec code inchangé et n’en déduit pas l’attribution", async () => {
  window.location.hash = "#/attente";
  const http = httpBoundary((url, options) =>
    url.endsWith("/waitlist") && options.method === "POST"
      ? response(204)
      : undefined,
  );
  render(<App client={createOfficeClient(http)} />);
  await screen.findByRole("navigation");
  await userEvent.click(
    screen.getByText("Ajouter à l’attente", { selector: "summary" }),
  );
  const form = within(
    screen.getByRole("form", { name: "Ajouter à l’attente" }),
  );
  for (const [label, value] of Object.entries({
    "Compte propriétaire (UUID)": owner,
    Marque: "Acme",
    "Nom du créateur": "Alice",
    Code: "mIxEd",
  }))
    await userEvent.type(form.getByLabelText(label), value);
  await userEvent.click(
    form.getByRole("button", { name: "Ajouter à l’attente" }),
  );
  expect(await form.findByRole("status")).toHaveTextContent(
    "Aucune attribution",
  );
  expect(
    JSON.parse(
      http.mock.calls.find(
        ([url, options]) =>
          url.endsWith("/waitlist") && options.method === "POST",
      )[1].body,
    ),
  ).toEqual({
    ownerId: owner,
    store: "Acme",
    creatorName: "Alice",
    code: "mIxEd",
  });
});
