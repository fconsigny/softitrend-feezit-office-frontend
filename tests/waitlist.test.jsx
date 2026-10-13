import { it, expect } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, owner, response } from "./http.js";
it("consulte l’attente et enregistre une réponse favorable sans attribuer une réservation", async () => {
  window.location.hash = "#/attente";
  const http = httpBoundary((url, options) => {
    if (options.method === "POST") return response(204);
    if (url.includes("/waitlist/responses?store=Acme"))
      return response(200, [
        {
          OWNER_ID: owner,
          RECEIVED_AT: "2026-10-01T12:00:00Z",
          EMAIL_REFERENCE: "email-01",
        },
      ]);
    if (url.includes("/waitlist?store=Acme"))
      return response(200, [
        { OWNER_ID: owner, CREATOR_NAME: "Alice", CODE: "mIxEd" },
      ]);
  });
  render(<App client={createOfficeClient(http)} />);
  const lookup = within(
    await screen.findByRole("form", { name: "Consulter l’attente" }),
  );
  await userEvent.type(lookup.getByLabelText("Marque à consulter"), "Acme");
  await userEvent.click(lookup.getByRole("button", { name: "Consulter" }));
  expect(await screen.findByText("Alice")).toBeInTheDocument();
  expect(await screen.findByText("email-01")).toBeInTheDocument();
  expect(screen.getByText(/aucune priorité d’ancienneté/i)).toBeInTheDocument();
  await userEvent.click(
    screen.getByText("Enregistrer une réponse favorable", {
      selector: "summary",
    }),
  );
  const form = within(
    screen.getByRole("form", { name: "Enregistrer une réponse favorable" }),
  );
  for (const [label, value] of Object.entries({
    "Compte propriétaire (UUID)": owner,
    Marque: "Acme",
    "Réponse reçue le (UTC)": "2026-10-02T10:00",
    "Référence email": "email-02",
  }))
    await userEvent.type(form.getByLabelText(label), value);
  await userEvent.click(
    form.getByRole("button", { name: "Enregistrer une réponse favorable" }),
  );
  await waitFor(() =>
    expect(form.getByRole("status")).toHaveTextContent("Aucune attribution"),
  );
  expect(http.mock.calls.some(([url]) => url.endsWith("/reservations"))).toBe(
    false,
  );
  const payload = JSON.parse(
    http.mock.calls.find(
      ([url, options]) =>
        url.endsWith("/waitlist/responses") && options.method === "POST",
    )[1].body,
  );
  expect(payload.receivedAt).toBe("2026-10-02T10:00:00.000Z");
});
it("relie les alias de marque seulement après confirmation et expose un refus de fusion", async () => {
  window.location.hash = "#/marques";
  const http = httpBoundary((url, options) => {
    if (url.endsWith("/brands") && options.method === "GET")
      return response(200, [
        { BRAND_KEY: "acme", DISPLAY_NAME: "Acme", ALIAS_KEY: "acme-fr" },
      ]);
    if (url.endsWith("/brands/aliases"))
      return response(409, { code: "CONFLICT" });
  });
  render(<App client={createOfficeClient(http)} />);
  expect(await screen.findByText("acme-fr")).toBeInTheDocument();
  const form = within(screen.getByRole("form", { name: "Relier un alias" }));
  await userEvent.type(form.getByLabelText("Alias"), "Acme-FR");
  await userEvent.type(form.getByLabelText("Marque canonique"), "Acme");
  await userEvent.click(form.getByRole("button", { name: "Relier un alias" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByText(/fusionne/i)).toBeInTheDocument();
  await userEvent.click(dialog.getByLabelText("Je confirme cette opération"));
  await userEvent.click(dialog.getByRole("button", { name: "Confirmer" }));
  expect(await form.findByRole("alert")).toHaveTextContent("Conflit");
  expect(form.getByLabelText("Alias")).toHaveValue("Acme-FR");
});
