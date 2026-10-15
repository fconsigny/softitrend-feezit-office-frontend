import { it, expect } from "vitest";
import {
  render,
  screen,
  within,
  waitFor,
  act,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, promo, owner, response, deferred } from "./http.js";
const original = {
  id: promo,
  ownerId: owner,
  store: "Acme",
  code: "MiXeD",
  publicationStatus: "masked",
  articleDescription: "Texte <b>non HTML</b>",
  articleImage: "https://images.example.test/a.png",
};
function setup(handler = () => undefined, hash = `#/offres?promoId=${promo}`) {
  window.location.hash = hash;
  const http = httpBoundary((url, options) => {
    const result = handler(url, options);
    if (result !== undefined) return result;
    if (url.endsWith(`/promos/${promo}`)) return response(200, original);
    if (url.includes("/promos?"))
      return response(200, { items: [original], total: 1 });
  });
  render(<App client={createOfficeClient(http)} />);
  return http;
}
async function editor() {
  const form = within(
    await screen.findByRole("form", { name: "Modifier le contenu de l’offre" }),
  );
  await waitFor(() =>
    expect(form.getByLabelText("Description de l’article")).toHaveValue(
      original.articleDescription,
    ),
  );
  return form;
}
async function confirm(form) {
  await userEvent.click(
    form.getByRole("button", { name: "Enregistrer le contenu" }),
  );
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByText(/ne publie pas/i)).toBeInTheDocument();
  await userEvent.click(dialog.getByLabelText("Je confirme cette opération"));
  await userEvent.click(dialog.getByRole("button", { name: "Confirmer" }));
}
it("réserve avec les champs facultatifs vides et conserve le statut brouillon", async () => {
  const http = setup(
    (url) =>
      url.endsWith("/reservations")
        ? response(200, { ...original, publicationStatus: "draft" })
        : undefined,
    "#/offres",
  );
  const form = within(
    await screen.findByRole("form", { name: "Préparer une réservation" }),
  );
  const values = {
    "Compte propriétaire (UUID)": owner,
    Marque: "Acme",
    Code: "MiXeD",
    Article: "Article",
    Catégorie: "Mode",
    Destination: "https://example.test/offer",
    "Accord reçu le (UTC)": "2026-10-01T12:00",
    "Référence de l’accord": "synthetic-email",
    "Version des documents": "0.1",
  };
  for (const [label, value] of Object.entries(values))
    await userEvent.type(form.getByLabelText(label), value);
  expect(form.getByLabelText("Description de l’article")).not.toBeRequired();
  expect(form.getByLabelText("Image de l’article (URL)")).not.toBeRequired();
  await userEvent.click(
    form.getByRole("button", { name: "Préparer une réservation" }),
  );
  const dialog = within(await screen.findByRole("dialog"));
  await userEvent.click(dialog.getByLabelText("Je confirme cette opération"));
  await userEvent.click(dialog.getByRole("button", { name: "Confirmer" }));
  await form.findByText(/Réservation préparée en brouillon/);
  const payload = JSON.parse(
    http.mock.calls.find(([url]) => url.endsWith("/reservations"))[1].body,
  );
  expect(payload.articleDescription).toBe("");
  expect(payload.articleImage).toBe("");
  expect(payload).not.toHaveProperty("publicationStatus");
});
it.each([
  [2001, "Préparer une réservation"],
  [2048, "Préparer une réservation"],
  [2001, "Modifier la bannière de l’offre"],
  [2048, "Modifier la bannière de l’offre"],
])(
  "autorise une URL image HTTP(S) de %i caractères : %s",
  async (length, name) => {
    setup();
    await editor();
    const prefix = "https://images.example.test/";
    const url = prefix + "x".repeat(length - prefix.length);
    const user = userEvent.setup();
    {
      const form = within(screen.getByRole("form", { name }));
      const input = form.getByLabelText("Image de l’article (URL)");
      await user.clear(input);
      await user.click(input);
      await user.paste(url);
      expect(input).toHaveValue(url);
      expect(input).toHaveAttribute("maxlength", "2048");
      expect(input.checkValidity()).toBe(true);
      expect(
        screen
          .getByRole("form", { name: "Modifier le contenu de l’offre" })
          .querySelector("textarea"),
      ).toHaveAttribute("maxlength", "2000");
    }
  },
);

it("annule la confirmation sans mutation et garde le brouillon", async () => {
  const http = setup();
  const form = await editor();
  await userEvent.clear(form.getByLabelText("Description de l’article"));
  await userEvent.type(
    form.getByLabelText("Description de l’article"),
    "À conserver",
  );
  await userEvent.click(
    form.getByRole("button", { name: "Enregistrer le contenu" }),
  );
  await userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Annuler",
    }),
  );
  expect(http.mock.calls.some(([url]) => url.endsWith("/description"))).toBe(
    false,
  );
  expect(form.getByLabelText("Description de l’article")).toHaveValue(
    "À conserver",
  );
});
it("réinitialise le brouillon à la sélection d’une autre offre", async () => {
  setup((url) =>
    url.endsWith(`/promos/${owner}`)
      ? response(200, {
          ...original,
          id: owner,
          articleDescription: "Autre offre",
          articleImage: "",
        })
      : undefined,
  );
  const form = await editor();
  await userEvent.clear(form.getByLabelText("Description de l’article"));
  await userEvent.type(
    form.getByLabelText("Description de l’article"),
    "Brouillon précédent",
  );
  await act(async () => {
    window.location.hash = `#/offres?promoId=${owner}`;
  });
  await waitFor(() =>
    expect(
      within(
        screen.getByRole("form", { name: "Modifier le contenu de l’offre" }),
      ).getByLabelText("Description de l’article"),
    ).toHaveValue("Autre offre"),
  );
  const next = within(
    screen.getByRole("form", { name: "Modifier le contenu de l’offre" }),
  );
  expect(next.getByLabelText("Description de l’article")).toHaveValue(
    "Autre offre",
  );
  expect(
    within(
      screen.getByRole("form", { name: "Modifier la bannière de l’offre" }),
    ).getByLabelText("Image de l’article (URL)"),
  ).toHaveValue("");
});

it("efface la description seule sans toucher à la bannière ni au code ni au masquage", async () => {
  let saved;
  setup((url, options) => {
    if (url.endsWith("/description")) {
      saved = JSON.parse(options.body);
      return response(200, { ...original, ...saved });
    }
    if (url.endsWith(`/promos/${promo}`) && saved)
      return response(200, { ...original, ...saved });
  });
  const form = await editor();
  await userEvent.clear(form.getByLabelText("Description de l’article"));
  await confirm(form);
  expect(await form.findByText(/Contenu enregistré/)).toBeInTheDocument();
  expect(saved).toEqual({ articleDescription: "" });
  expect(form.getByLabelText("Description de l’article")).toHaveValue("");
  expect(
    within(
      screen.getByRole("form", { name: "Modifier la bannière de l’offre" }),
    ).getByLabelText("Image de l’article (URL)"),
  ).toHaveValue(original.articleImage);
  expect(screen.getByRole("img")).toHaveAttribute("src", original.articleImage);
  expect(screen.getByText(/MiXeD · Masqué/)).toBeInTheDocument();
});
it("conserve le brouillon après refus serveur et ne simule aucune mutation", async () => {
  const http = setup((url) =>
    url.endsWith("/description") ? response(400, {}) : undefined,
  );
  const form = await editor();
  await userEvent.clear(form.getByLabelText("Description de l’article"));
  await userEvent.type(
    form.getByLabelText("Description de l’article"),
    "Rejeté",
  );
  await confirm(form);
  expect(await form.findByRole("alert")).toHaveTextContent("Données invalides");
  expect(form.getByLabelText("Description de l’article")).toHaveValue("Rejeté");
  expect(form.queryByText(/Contenu enregistré/)).not.toBeInTheDocument();
  expect(
    screen.getAllByText(original.articleDescription).length,
  ).toBeGreaterThan(0);
  expect(
    http.mock.calls.filter(([url]) => url.endsWith(`/promos/${promo}`)),
  ).toHaveLength(1);
});
it("n’annonce pas de succès si la relecture après PUT échoue", async () => {
  let saved = false;
  setup((url) => {
    if (url.endsWith("/description")) {
      saved = true;
      return response(200, original);
    }
    if (url.endsWith(`/promos/${promo}`) && saved) return response(502, {});
  });
  const form = await editor();
  await confirm(form);
  expect(await form.findByRole("alert")).toHaveTextContent("indisponible");
  expect(form.queryByText(/Contenu enregistré/)).not.toBeInTheDocument();
});
it("préserve le brouillon dirty pendant une actualisation sans masquer le contenu serveur", async () => {
  let reads = 0;
  setup((url) =>
    url.endsWith(`/promos/${promo}`)
      ? response(200, {
          ...original,
          articleDescription:
            ++reads > 1 ? "Nouveau serveur" : original.articleDescription,
        })
      : undefined,
  );
  const form = await editor();
  await userEvent.clear(form.getByLabelText("Description de l’article"));
  await userEvent.type(
    form.getByLabelText("Description de l’article"),
    "Brouillon local",
  );
  await userEvent.click(screen.getByRole("button", { name: "Actualiser" }));
  await screen.findByText("Nouveau serveur");
  expect(form.getByLabelText("Description de l’article")).toHaveValue(
    "Brouillon local",
  );
});
it("ignore une ancienne prélecture lors du changement d’offre", async () => {
  const late = deferred();
  setup((url) => {
    if (url.endsWith(`/promos/${promo}`)) return late.promise;
    if (url.endsWith(`/promos/${owner}`))
      return response(200, {
        ...original,
        id: owner,
        articleDescription: "Offre sélectionnée",
      });
  });
  await screen.findByText("Chargement du contenu…");
  await act(async () => {
    window.location.hash = `#/offres?promoId=${owner}`;
  });
  const form = within(
    await screen.findByRole("form", { name: "Modifier le contenu de l’offre" }),
  );
  await waitFor(() =>
    expect(form.getByLabelText("Description de l’article")).toHaveValue(
      "Offre sélectionnée",
    ),
  );
  await act(async () => late.resolve(response(200, original)));
  expect(form.getByLabelText("Description de l’article")).toHaveValue(
    "Offre sélectionnée",
  );
});
it("ignore une sauvegarde tardive après déconnexion et efface les données privées", async () => {
  const late = deferred();
  setup((url) => (url.endsWith("/description") ? late.promise : undefined));
  const form = await editor();
  await confirm(form);
  await userEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
  await screen.findByRole("heading", { name: "Connexion opérateur" });
  await act(async () => late.resolve(response(200, original)));
  expect(
    screen.queryByRole("form", { name: "Modifier le contenu de l’offre" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(original.articleDescription),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/Contenu enregistré/)).not.toBeInTheDocument();
});

it("prévisualise une image de réservation sans rendre le texte HTML", async () => {
  setup();
  const form = within(
    await screen.findByRole("form", { name: "Préparer une réservation" }),
  );
  await userEvent.type(
    form.getByLabelText("Image de l’article (URL)"),
    "https://images.example.test/draft.png",
  );
  expect(
    form.getByRole("img", { name: "Aperçu de l’article" }),
  ).toHaveAttribute("src", "https://images.example.test/draft.png");
  await userEvent.clear(form.getByLabelText("Image de l’article (URL)"));
  expect(form.queryByRole("img")).not.toBeInTheDocument();
});

it("refuse une image non HTTP(S) à la création sans envoyer de réservation", async () => {
  const http = setup();
  const form = within(
    await screen.findByRole("form", { name: "Préparer une réservation" }),
  );
  const image = form.getByLabelText("Image de l’article (URL)");
  await userEvent.type(image, "javascript:alert(1)");
  expect(image.validity.valid).toBe(false);
  expect(image).toHaveAttribute("pattern", "https?://.+");
  expect(form.getByLabelText("Description de l’article")).toHaveAttribute(
    "maxlength",
    "2000",
  );
  expect(http.mock.calls.some(([url]) => url.endsWith("/reservations"))).toBe(
    false,
  );
});

it("prévisualise uniquement HTTP(S) sans référent et garde l’URL visible après échec", async () => {
  setup();
  const form = await editor();
  expect(
    form.queryByLabelText("Image de l’article (URL)"),
  ).not.toBeInTheDocument();
  const image = within(
    screen.getByRole("region", { name: "Contenu de l’offre" }),
  ).getByRole("img", { name: "Aperçu de l’article" });
  expect(image).toHaveAttribute("src", original.articleImage);
  expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
  fireEvent.error(image);
  expect(
    screen.getByText("Aperçu indisponible. L’URL reste consultable."),
  ).toBeInTheDocument();
  expect(screen.getAllByText(original.articleImage).length).toBeGreaterThan(0);
  expect(
    within(
      screen.getByRole("form", { name: "Modifier la bannière de l’offre" }),
    ).getByLabelText("Image de l’article (URL)"),
  ).toHaveValue(original.articleImage);
});
it.each([
  "javascript:alert(1)",
  "data:image/svg+xml,<svg/>",
  "ftp://images.example.test/a.png",
  "/relative.png",
  "https://user:password@images.example.test/a.png",
  "https://",
])(
  "ne charge jamais l’image non sûre %s retournée par le serveur",
  async (unsafe) => {
    setup((url) =>
      url.endsWith(`/promos/${promo}`)
        ? response(200, { ...original, articleImage: unsafe })
        : undefined,
    );
    const form = within(
      await screen.findByRole("form", {
        name: "Modifier la bannière de l’offre",
      }),
    );
    await waitFor(() =>
      expect(form.getByLabelText("Image de l’article (URL)")).toHaveValue(
        unsafe,
      ),
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(unsafe)).toBeInTheDocument();
  },
);

it("préremplit l’offre masquée, affiche le texte échappé et relit le contenu avant succès", async () => {
  let saved;
  const reread = deferred();
  const http = setup((url, options) => {
    if (url.endsWith("/description")) {
      saved = JSON.parse(options.body);
      return response(200, { ...original, ...saved });
    }
    if (url.endsWith(`/promos/${promo}`) && saved) return reread.promise;
  });
  const form = await editor();
  expect(
    screen.getAllByText(original.articleDescription).length,
  ).toBeGreaterThan(0);
  expect(document.querySelector("b")).toBeNull();
  expect(screen.getAllByText(original.articleImage).length).toBeGreaterThan(0);
  const link = screen.getByRole("link", { name: "Modifier le contenu" });
  expect(link).toHaveAttribute("href", `#/offres?promoId=${promo}`);
  await userEvent.clear(form.getByLabelText("Description de l’article"));
  await userEvent.type(
    form.getByLabelText("Description de l’article"),
    "Description revue",
  );
  await confirm(form);
  await waitFor(() =>
    expect(saved).toEqual({
      articleDescription: "Description revue",
    }),
  );
  expect(form.queryByText(/Contenu enregistré/)).not.toBeInTheDocument();
  const put = http.mock.calls.find(([url]) => url.endsWith("/description"))[1];
  expect(put.method).toBe("PUT");
  expect(put.headers["X-CSRF-TOKEN"]).toBeTruthy();
  await act(async () =>
    reread.resolve(response(200, { ...original, ...saved })),
  );
  expect(await form.findByText(/Contenu enregistré/)).toBeInTheDocument();
  await waitFor(() =>
    expect(
      http.mock.calls.filter(([url]) => url.includes("/promos?")).length,
    ).toBeGreaterThan(1),
  );
});
