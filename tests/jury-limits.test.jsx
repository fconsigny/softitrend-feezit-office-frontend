import { it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, owner, response } from "./http.js";

it.each([
  [
    "offres",
    "Préparer une réservation",
    [
      ["Marque", 100],
      ["Code", 80],
      ["Article", 150],
      ["Catégorie", 80],
      ["Version des documents", 100],
      ["Destination", 2048],
      ["Description de l’article", 2000],
    ],
  ],
  [
    "moderation",
    "Créer un nouveau profil",
    [
      ["Pseudo", 30],
      ["Nom", 100],
      ["Biographie", 1000],
      ["Avatar (URL)", 2048],
      ["Catégorie", 80],
    ],
  ],
  [
    "moderation",
    "Masquer temporairement",
    [
      ["Faits", 4000],
      ["Échanges", 4000],
    ],
  ],
  [
    "attente",
    "Ajouter à l’attente",
    [
      ["Marque", 100],
      ["Nom du créateur", 100],
      ["Code", 80],
    ],
  ],
  [
    "marques",
    "Relier un alias",
    [
      ["Alias", 100],
      ["Marque canonique", 100],
    ],
  ],
])(
  "aligne les limites du formulaire %s / %s sans réduction des champs autorisés",
  async (route, name, fields) => {
    window.location.hash = `#/${route}`;
    render(<App client={createOfficeClient(httpBoundary())} />);
    await screen.findByRole("navigation");
    const details = screen
      .getByText(name, { selector: "summary" })
      .closest("details");
    if (!details.open)
      await userEvent.click(
        within(details).getByText(name, { selector: "summary" }),
      );
    const form = within(screen.getByRole("form", { name }));
    for (const [label, limit] of fields) {
      const input = form.getByLabelText(label);
      expect(input).toHaveAttribute("maxlength", String(limit));
      const value = "x".repeat(limit);
      fireEvent.change(input, { target: { value } });
      expect(input).toHaveValue(value);
      fireEvent.change(input, { target: { value: value + "x" } });
      fireEvent.submit(input.closest("form"));
      expect(await form.findByRole("alert")).toHaveTextContent(
        `${label} : ${limit}`,
      );
      expect(input).toHaveValue(value + "x");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      fireEvent.change(input, { target: { value } });
    }
  },
);
it("transmet 4000 caractères de faits et échanges sans troncature", async () => {
  window.location.hash = `#/moderation?ownerId=${owner}`;
  const http = httpBoundary((url) =>
    url.endsWith("/moderation") ? response(204) : undefined,
  );
  render(<App client={createOfficeClient(http)} />);
  await screen.findByRole("navigation");
  await userEvent.click(
    screen.getByText("Masquer temporairement", { selector: "summary" }),
  );
  const form = within(
    screen.getByRole("form", { name: "Masquer temporairement" }),
  );
  for (const [label, value] of [
    ["Motif", "Motif"],
    ["Faits", "f".repeat(4000)],
    ["Échanges", "e".repeat(4000)],
    ["Référence dossier", "constructor"],
  ])
    fireEvent.change(form.getByLabelText(label), { target: { value } });
  await userEvent.click(
    form.getByRole("button", { name: "Masquer temporairement" }),
  );
  const dialog = within(await screen.findByRole("dialog"));
  await userEvent.click(dialog.getByLabelText("Je confirme cette opération"));
  await userEvent.click(dialog.getByRole("button", { name: "Confirmer" }));
  await form.findByRole("status");
  const payload = JSON.parse(
    http.mock.calls.find(
      ([url, options]) =>
        url.endsWith("/moderation") && options.method === "PUT",
    )[1].body,
  );
  expect(payload.facts).toBe("f".repeat(4000));
  expect(payload.exchanges).toBe("e".repeat(4000));
});
it("refuse explicitement N+1 sans tronquer ni ouvrir de confirmation", async () => {
  window.location.hash = `#/offres?ownerId=${owner}`;
  const http = httpBoundary();
  render(<App client={createOfficeClient(http)} />);
  const element = await screen.findByRole("form", {
    name: "Préparer une réservation",
  });
  const form = within(element);
  fireEvent.change(form.getByLabelText("Article"), {
    target: { value: "a".repeat(151) },
  });
  fireEvent.submit(element);
  expect(await form.findByRole("alert")).toHaveTextContent(/Article.*150/);
  expect(form.getByLabelText("Article")).toHaveValue("a".repeat(151));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(http.mock.calls.some(([url]) => url.endsWith("/reservations"))).toBe(
    false,
  );
});
it("borne la recherche interne à200 et la consultation de marque à100", async () => {
  window.location.hash = "#/comptes";
  const http = httpBoundary();
  render(<App client={createOfficeClient(http)} />);
  const search = await screen.findByLabelText("Rechercher");
  expect(search).toHaveAttribute("maxlength", "200");
  fireEvent.change(search, { target: { value: "q".repeat(201) } });
  fireEvent.submit(search.closest("form"));
  expect(await screen.findByRole("alert")).toHaveTextContent(/200/);
  expect(
    http.mock.calls.some(([url]) => url.includes("q=" + "q".repeat(201))),
  ).toBe(false);
  await userEvent.click(screen.getByRole("link", { name: "Liste d’attente" }));
  expect(await screen.findByLabelText("Marque à consulter")).toHaveAttribute(
    "maxlength",
    "100",
  );
});
