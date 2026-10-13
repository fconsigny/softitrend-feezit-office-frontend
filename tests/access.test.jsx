import { it, expect } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, response, deferred } from "./http.js";
it("ouvre la navigation après une vraie session et renouvelle CSRF après connexion et déconnexion", async () => {
  const http = httpBoundary(undefined, false);
  render(<App client={createOfficeClient(http)} />);
  await userEvent.type(
    await screen.findByLabelText("Identifiant Office"),
    "operateur",
  );
  await userEvent.type(screen.getByLabelText("Mot de passe"), "synthetic");
  await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
  expect(await screen.findByRole("navigation")).toBeInTheDocument();
  expect(http.mock.calls.filter(([url]) => url.endsWith("/csrf"))).toHaveLength(
    2,
  );
  await userEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
  await screen.findByLabelText("Identifiant Office");
  await waitFor(() =>
    expect(
      http.mock.calls.filter(([url]) => url.endsWith("/csrf")),
    ).toHaveLength(3),
  );
  const logout = http.mock.calls.find(([url]) =>
    url.endsWith("/auth/logout"),
  )[1];
  expect(logout.headers["X-CSRF-TOKEN"]).toBe("csrf-2");
});
it("efface les données sur 401 et ignore une lecture tardive après déconnexion", async () => {
  const late = deferred();
  const http = httpBoundary((url) =>
    url.includes("/incidents?") ? late.promise : undefined,
  );
  const client = createOfficeClient(http);
  render(<App client={client} />);
  await screen.findByRole("navigation");
  await userEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
  await screen.findByLabelText("Identifiant Office");
  await act(async () =>
    late.resolve(
      response(200, { items: [{ kind: "DONNEE TARDIVE" }], total: 1 }),
    ),
  );
  expect(screen.queryByText("DONNEE TARDIVE")).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});
it("ferme immédiatement la vue privée lorsqu’une lecture authentifiée reçoit 401", async () => {
  const http = httpBoundary((url) =>
    url.includes("/incidents?") ? response(401) : undefined,
  );
  render(<App client={createOfficeClient(http)} />);
  expect(
    await screen.findByLabelText("Identifiant Office"),
  ).toBeInTheDocument();
  expect(await screen.findByRole("alert")).toHaveTextContent("Session expirée");
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});
