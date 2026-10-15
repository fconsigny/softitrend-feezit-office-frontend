import { it, expect } from "vitest";
import {
  render,
  screen,
  within,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, owner, promo, response, deferred } from "./http.js";
const original = {
  id: promo,
  ownerId: owner,
  store: "Acme",
  code: "draft",
  publicationStatus: "masked",
  status: "expired",
  articleDescription: "Initial",
  articleImage: "",
  destinationUrl: "https://merchant.example/old",
};
function setup(handler = () => undefined) {
  window.location.hash = `#/offres?promoId=${promo}`;
  const http = httpBoundary(
    (url, options) =>
      handler(url, options) ??
      (url.endsWith(`/promos/${promo}`) ? response(200, original) : undefined),
  );
  render(<App client={createOfficeClient(http)} />);
  return http;
}
async function destination() {
  const f = within(
    await screen.findByRole("form", {
      name: "Modifier la destination de l’offre",
    }),
  );
  await waitFor(() =>
    expect(f.getByLabelText("Destination (URL HTTP/S)")).toHaveValue(
      original.destinationUrl,
    ),
  );
  return f;
}
async function confirm(f) {
  await userEvent.click(
    f.getByRole("button", { name: "Enregistrer la destination" }),
  );
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByText(/ne republie pas/)).toBeInTheDocument();
  expect(dialog.getByText(promo)).toBeInTheDocument();
  await userEvent.click(dialog.getByLabelText("Je confirme cette opération"));
  await userEvent.click(dialog.getByRole("button", { name: "Confirmer" }));
}
it("modifie uniquement destinationUrl après confirmation ; le brouillon contenu reste indépendant", async () => {
  let saved;
  const http = setup((url, options) => {
    if (url.endsWith("/destination")) {
      saved = JSON.parse(options.body);
      return response(200, { ...original, ...saved });
    }
    if (url.endsWith(`/promos/${promo}`) && saved)
      return response(200, { ...original, ...saved });
  });
  const f = await destination();
  const content = within(
    screen.getByRole("form", { name: "Modifier le contenu de l’offre" }),
  );
  fireEvent.change(content.getByLabelText("Description de l’article"), {
    target: { value: "Contenu non sauvegardé" },
  });
  fireEvent.change(f.getByLabelText("Destination (URL HTTP/S)"), {
    target: { value: "https://merchant.example/new" },
  });
  await confirm(f);
  expect(
    await f.findByText(/Destination enregistrée et relue/),
  ).toBeInTheDocument();
  expect(saved).toEqual({ destinationUrl: "https://merchant.example/new" });
  expect(content.getByLabelText("Description de l’article")).toHaveValue(
    "Contenu non sauvegardé",
  );
  const put = http.mock.calls.find(([url]) => url.endsWith("/destination"))[1];
  expect(put.method).toBe("PUT");
  expect(put.headers["X-CSRF-TOKEN"]).toBeTruthy();
  expect(http.mock.calls.some(([url]) => url.endsWith("/description"))).toBe(false);
  expect(screen.getByText("Masqué", { selector: "dd" })).toBeInTheDocument();
});
it("une destination refusée garde sa saisie sans annoncer succès", async () => {
  setup((url) =>
    url.endsWith("/destination") ? response(400, {}) : undefined,
  );
  const f = await destination();
  fireEvent.change(f.getByLabelText("Destination (URL HTTP/S)"), {
    target: { value: "https://merchant.example/rejected" },
  });
  await confirm(f);
  expect(await f.findByRole("alert")).toHaveTextContent("Données invalides");
  expect(f.getByLabelText("Destination (URL HTTP/S)")).toHaveValue(
    "https://merchant.example/rejected",
  );
  expect(f.queryByText(/Destination enregistrée/)).not.toBeInTheDocument();
});
it("PUT destination accepté puis GET échoué : Relire seul et aucun nouvel envoi", async () => {
  let saved = false,
    fail = true;
  const http = setup((url) => {
    if (url.endsWith("/destination")) {
      saved = true;
      return response(200, original);
    }
    if (url.endsWith(`/promos/${promo}`) && saved && fail)
      return response(502, {});
  });
  const f = await destination();
  await confirm(f);
  expect(await f.findByRole("alert")).toHaveTextContent(
    /enregistrement accepté/i,
  );
  fail = false;
  await userEvent.click(f.getByRole("button", { name: "Relire", exact: true }));
  await f.findByText(/Destination enregistrée et relue/);
  expect(
    http.mock.calls.filter(([url]) => url.endsWith("/destination")),
  ).toHaveLength(1);
});
it.each([
  "",
  "javascript:alert(1)",
  "ftp://merchant.example/test",
  "https://user:pass@merchant.example/test",
])("refuse la destination %s côté formulaire sans mutation", async (url) => {
  const http = setup();
  const f = await destination();
  const input = f.getByLabelText("Destination (URL HTTP/S)");
  fireEvent.change(input, { target: { value: url } });
  await userEvent.click(
    f.getByRole("button", { name: "Enregistrer la destination" }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(http.mock.calls.some(([path]) => path.endsWith("/destination"))).toBe(
    false,
  );
});
it("ignore une réponse de destination tardive après logout", async () => {
  const late = deferred();
  setup((url) => (url.endsWith("/destination") ? late.promise : undefined));
  const f = await destination();
  await confirm(f);
  await userEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
  await screen.findByRole("heading", { name: "Connexion opérateur" });
  await act(async () => late.resolve(response(200, original)));
  expect(
    screen.queryByRole("form", { name: "Modifier la destination de l’offre" }),
  ).not.toBeInTheDocument();
});
