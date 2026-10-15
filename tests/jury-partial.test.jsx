import { it, expect } from "vitest";
import {
  render,
  screen,
  within,
  act,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, owner, promo, response, deferred } from "./http.js";
const original = {
  id: promo,
  ownerId: owner,
  code: "draft",
  publicationStatus: "masked",
  articleDescription: "Initial",
  articleImage: "",
  destinationUrl: "https://merchant.example/old",
};
function setup(handler) {
  window.location.hash = `#/offres?promoId=${promo}`;
  const http = httpBoundary(
    (url, options) =>
      handler(url, options) ??
      (url.endsWith(`/promos/${promo}`) ? response(200, original) : undefined),
  );
  render(<App client={createOfficeClient(http)} />);
  return http;
}
async function form() {
  const f = within(
    await screen.findByRole("form", { name: "Modifier le contenu de l’offre" }),
  );
  await waitFor(() =>
    expect(f.getByLabelText("Description de l’article")).toHaveValue("Initial"),
  );
  return f;
}
async function confirm(f) {
  await userEvent.click(
    f.getByRole("button", { name: "Enregistrer le contenu" }),
  );
  const dialog = within(await screen.findByRole("dialog"));
  await userEvent.click(dialog.getByLabelText("Je confirme cette opération"));
  await userEvent.click(dialog.getByRole("button", { name: "Confirmer" }));
}
it.each([
  ["Description de l’article", 2000],
  ["Image de l’article (URL)", 2048],
])("refuse le contenu %s à N+1 sans perte de saisie", async (label, max) => {
  const http = setup(() => undefined);
  await form();
  const f = within(
    screen.getByRole("form", {
      name: label.startsWith("Image")
        ? "Modifier la bannière de l’offre"
        : "Modifier le contenu de l’offre",
    }),
  );
  const input = f.getByLabelText(label);
  fireEvent.change(input, { target: { value: "x".repeat(max + 1) } });
  fireEvent.submit(input.closest("form"));
  expect(await f.findByRole("alert")).toHaveTextContent(String(max));
  expect(input).toHaveValue("x".repeat(max + 1));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(http.mock.calls.some(([url]) => url.endsWith("/description"))).toBe(
    false,
  );
});
it("signale PUT accepté GET échoué et Relire ne réémet jamais PUT, même après nouvelle saisie", async () => {
  let saved,
    failRead = true;
  const http = setup((url, options) => {
    if (url.endsWith("/description")) {
      saved = JSON.parse(options.body);
      return response(200, { ...original, ...saved });
    }
    if (url.endsWith(`/promos/${promo}`) && saved)
      return failRead
        ? response(502, {})
        : response(200, { ...original, ...saved });
  });
  const f = await form();
  fireEvent.change(f.getByLabelText("Description de l’article"), {
    target: { value: "Sauvegardé" },
  });
  await confirm(f);
  expect(await f.findByRole("alert")).toHaveTextContent(
    /enregistrement accepté.*relecture.*échoué/i,
  );
  expect(f.getByLabelText("Description de l’article")).toHaveValue(
    "Sauvegardé",
  );
  expect(
    f.getByRole("button", { name: "Enregistrer le contenu" }),
  ).toBeDisabled();
  fireEvent.change(f.getByLabelText("Description de l’article"), {
    target: { value: "Nouveau brouillon" },
  });
  failRead = false;
  await userEvent.click(f.getByRole("button", { name: "Relire", exact: true }));
  expect(await f.findByRole("status")).toHaveTextContent(/relu/);
  expect(f.getByLabelText("Description de l’article")).toHaveValue(
    "Nouveau brouillon",
  );
  expect(
    http.mock.calls.filter(([url]) => url.endsWith("/description")),
  ).toHaveLength(1);
});
it("une actualisation ancienne ne peut écraser le PUT et sa relecture confirmée", async () => {
  const late = deferred();
  let reads = 0,
    saved;
  setup((url, options) => {
    if (url.endsWith("/description")) {
      saved = JSON.parse(options.body);
      return response(200, { ...original, ...saved });
    }
    if (url.endsWith(`/promos/${promo}`)) {
      reads++;
      if (reads === 2) return late.promise;
      return response(200, { ...original, ...saved });
    }
  });
  const f = await form();
  fireEvent.change(f.getByLabelText("Description de l’article"), {
    target: { value: "Confirmé" },
  });
  // Open confirmation first, then a competing global refresh while the modal is open.
  await userEvent.click(
    f.getByRole("button", { name: "Enregistrer le contenu" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
  await waitFor(() => expect(reads).toBe(2));
  const dialog = within(screen.getByRole("dialog"));
  await userEvent.click(dialog.getByLabelText("Je confirme cette opération"));
  await userEvent.click(dialog.getByRole("button", { name: "Confirmer" }));
  await f.findByText(/Contenu enregistré/);
  await act(async () =>
    late.resolve(
      response(200, { ...original, articleDescription: "Obsolète" }),
    ),
  );
  expect(f.getByLabelText("Description de l’article")).toHaveValue("Confirmé");
  expect(screen.queryByText("Obsolète")).not.toBeInTheDocument();
});
