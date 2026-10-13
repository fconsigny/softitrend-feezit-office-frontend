import { it, expect } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, promo, response } from "./http.js";
it("distingue pending d’une émission attestée par le serveur sans déduire une réception", async () => {
  window.location.hash = "#/notifications";
  const http = httpBoundary((url) => {
    if (url.endsWith("/outbox")) return response(200, [
      {ID:promo, KIND:"brand_available", DELIVERY_STATUS:"pending", SENT_AT:null, DELIVERY_REFERENCE:null},
      {ID:"delivery-history-test", KIND:"brand_available", DELIVERY_STATUS:"sent", SENT_AT:"2026-10-01T12:00:00Z", DELIVERY_REFERENCE:"provider-test"},
    ]);
    if (url.endsWith("/email-deliveries")) return response(200, [
      {id:"delivery-test", status:"failed", failureCode:"SMTP_UNAVAILABLE", smtpReference:null},
    ]);
  });
  render(<App client={createOfficeClient(http)} />);
  expect(await screen.findByText("En attente d’émission")).toBeInTheDocument();
  expect(await screen.findByText("Émission attestée")).toBeInTheDocument();
  expect(await screen.findByText("SMTP_UNAVAILABLE")).toBeInTheDocument();
  expect(screen.getByText("provider-test")).toBeInTheDocument();
  expect(screen.getByText(/ne prouve pas la réception/i)).toBeInTheDocument();
  expect(http.mock.calls.some(([url, options]) => url.endsWith("/sent") && options.method === "PUT")).toBe(false);
});
it("n’expose pas d’attestation manuelle que le Feezit actuel refuse systématiquement", async () => {
  window.location.hash = "#/notifications";
  const http = httpBoundary((url) => url.endsWith("/outbox") ? response(200, [{ID:promo, DELIVERY_STATUS:"pending", SENT_AT:null}]) : undefined);
  render(<App client={createOfficeClient(http)} />);
  await screen.findByText("En attente d’émission");
  expect(screen.queryByRole("form", {name:"Attester une émission réelle"})).not.toBeInTheDocument();
  expect(screen.queryByRole("link", {name:"Attester"})).not.toBeInTheDocument();
  expect(screen.getByText(/confirmation manuelle indisponible/i)).toBeInTheDocument();
  expect(http.mock.calls.some(([url, options]) => url.endsWith("/sent") && options.method === "PUT")).toBe(false);
});
it("ne lance les jobs à effets destructifs qu’après confirmation explicite", async () => {
  window.location.hash = "#/notifications";
  const http = httpBoundary((url) =>
    url.endsWith("/jobs/run") ? response(204) : undefined,
  );
  render(<App client={createOfficeClient(http)} />);
  await screen.findByRole("navigation");
  await userEvent.click(
    screen.getByText("Exécuter les échéances", { selector: "summary" }),
  );
  const form = within(
    screen.getByRole("form", { name: "Exécuter les échéances" }),
  );
  await userEvent.click(
    form.getByRole("button", { name: "Exécuter les échéances" }),
  );
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByText(/suppression/i)).toBeInTheDocument();
  expect(http.mock.calls.some(([url]) => url.endsWith("/jobs/run"))).toBe(
    false,
  );
  await userEvent.click(dialog.getByLabelText("Je confirme cette opération"));
  await userEvent.click(dialog.getByRole("button", { name: "Confirmer" }));
  await waitFor(() =>
    expect(form.getByRole("status")).toHaveTextContent("serveur"),
  );
  expect(
    http.mock.calls.find(([url]) => url.endsWith("/jobs/run"))[1].body,
  ).toBeUndefined();
});
