import { it, expect } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, owner, response, deferred } from "./http.js";
it("le lien d’évitement donne le focus au contenu sans casser la navigation", async () => {
  render(<App client={createOfficeClient(httpBoundary())} />);
  await screen.findByRole("navigation");
  await userEvent.click(screen.getByRole("link", { name: "Aller au contenu" }));
  expect(screen.queryByText("Page introuvable")).not.toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveFocus();
});
it("la confirmation montre le compte exact et les valeurs qui seront transmises", async () => {
  window.location.hash = "#/moderation";
  render(<App client={createOfficeClient(httpBoundary())} />);
  await screen.findByRole("navigation");
  await userEvent.click(
    screen.getByText("Lever le bannissement", { selector: "summary" }),
  );
  const form = within(
    screen.getByRole("form", { name: "Lever le bannissement" }),
  );
  await userEvent.type(
    form.getByLabelText("Compte propriétaire (UUID)"),
    owner,
  );
  await userEvent.click(
    form.getByRole("button", { name: "Lever le bannissement" }),
  );
  expect(
    within(screen.getByRole("dialog")).getByText(owner),
  ).toBeInTheDocument();
});
it("un login tardif ne rouvre pas la session après une déconnexion", async () => {
  const late = deferred();
  const http = httpBoundary(
    (url) => (url.endsWith("/auth/login") ? late.promise : undefined),
    false,
  );
  const client = createOfficeClient(http);
  await client.initialize();
  const login = client.login("synthetic", "synthetic").catch((error) => error);
  await client.logout();
  late.resolve(response(204));
  expect((await login).name).toBe("AbortError");
  expect(client.getSnapshot().phase).toBe("anonymous");
});
it("un ancien 401 ne révoque pas la nouvelle session", async () => {
  const late = deferred();
  const http = httpBoundary((url) =>
    url.includes("/incidents?") ? late.promise : undefined,
  );
  const client = createOfficeClient(http);
  await client.initialize();
  const previous = client
    .management("incidents?page=0&size=20")
    .catch((error) => error);
  await client.logout();
  await client.login("synthetic", "synthetic");
  late.resolve(response(401));
  expect((await previous).name).toBe("AbortError");
  expect(client.getSnapshot().phase).toBe("authenticated");
});
it("un échec de déconnexion efface quand même les données et signale le statut serveur non confirmé", async () => {
  const http = httpBoundary((url) =>
    url.endsWith("/auth/logout") ? response(502) : undefined,
  );
  render(<App client={createOfficeClient(http)} />);
  await screen.findByRole("navigation");
  await userEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Déconnexion serveur non confirmée",
  );
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});
it("une mutation terminée après logout ne publie aucun message privé", async () => {
  window.location.hash = "#/attente";
  const late = deferred();
  const http = httpBoundary((url, options) =>
    url.endsWith("/waitlist") && options.method === "POST"
      ? late.promise
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
  await userEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
  await screen.findByLabelText("Identifiant Office");
  await act(async () => late.resolve(response(204)));
  expect(
    screen.queryByText(
      "Attente enregistrée. Aucune attribution ni émission email confirmée.",
    ),
  ).not.toBeInTheDocument();
});
