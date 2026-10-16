import { it, expect, vi } from "vitest";
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
import { httpBoundary, promo, owner, response, deferred } from "./http.js";
const path = `/office-api/management/promos/${promo}`;
const original = {
  id: promo,
  ownerId: owner,
  store: "Acme",
  code: "Exact",
  publicationStatus: "masked",
  articleDescription: "Description initiale",
  articleImage: "https://images.example.test/old.png",
};
function setup(handler = () => undefined, navigationId = promo) {
  let record = { ...original };
  let image = { url: record.articleImage, contentType: null, base64: null };
  window.location.hash = `#/offres?promoId=${navigationId}`;
  const http = httpBoundary((url, options) => {
    const result = handler(url, options);
    if (result !== undefined) return result;
    if (url === `${path}/banner`) {
      if (options.method === "PUT") {
        const data = JSON.parse(options.body);
        image =
          data.url !== undefined
            ? { url: data.url, contentType: null, base64: null }
            : {
                url: `https://feezit.example.test/api/promos/${promo}/banner`,
                ...data,
              };
        record = { ...record, articleImage: image.url };
        return response(200, record);
      }
      return response(200, image);
    }
    if (url === `${path}/description` && options.method === "PUT") {
      record = { ...record, ...JSON.parse(options.body) };
      return response(200, record);
    }
    if (url === path) return response(200, { ...record });
    if (url.includes("/promos?"))
      return response(200, { items: [record], total: 1 });
  });
  render(<App client={createOfficeClient(http)} />);
  return http;
}
async function banner() {
  const form = within(
    await screen.findByRole("form", {
      name: "Modifier la bannière de l’offre",
    }),
  );
  await waitFor(() =>
    expect(form.getByLabelText("Image de l’article (URL)")).toHaveValue(
      original.articleImage,
    ),
  );
  return form;
}
async function confirm(form, name = "Enregistrer la bannière") {
  await userEvent.click(form.getByRole("button", { name, exact: true }));
  const dialog = within(await screen.findByRole("dialog"));
  await userEvent.click(dialog.getByLabelText("Je confirme cette opération"));
  await userEvent.click(
    dialog.getByRole("button", { name: "Confirmer", exact: true }),
  );
}
const puts = (http) =>
  http.mock.calls.filter(([, options]) => options.method === "PUT");
it("importe un fichier valide malgré un brouillon URL invalide inactif", async () => {
  const http = setup();
  const form = await banner();
  fireEvent.change(form.getByLabelText("Image de l’article (URL)"), {
    target: { value: "not a valid URL" },
  });
  await userEvent.upload(
    form.getByLabelText("Importer PNG/JPEG (1 MiB maximum)"),
    new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      "valide.png",
      {
        type: "image/png",
      },
    ),
  );
  await form.findByText(/valide.png/);
  expect(
    form
      .getByRole("button", { name: "Enregistrer la bannière", exact: true })
      .form.checkValidity(),
  ).toBe(true);
  await confirm(form);
  await form.findByText(/Bannière enregistrée et relue/);
  expect(
    puts(http).map(([url, options]) => [url, JSON.parse(options.body)]),
  ).toEqual([
    [`${path}/banner`, { contentType: "image/png", base64: "iVBORw0KGgo=" }],
  ]);
});
it.each(["image/png", "image/jpeg"])(
  "importe %s et relit l’aperçu privé JSON sans utiliser l’URL publique masquée",
  async (type) => {
    const http = setup();
    const form = await banner();
    const bytes =
      type === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10, 0]
        : [255, 216, 255, 224, 0];
    await userEvent.upload(
      form.getByLabelText("Importer PNG/JPEG (1 MiB maximum)"),
      new File([new Uint8Array(bytes)], "image", { type }),
    );
    await confirm(form);
    await form.findByText(/Bannière enregistrée et relue/);
    const data = JSON.parse(puts(http)[0][1].body);
    expect(data).toEqual({
      contentType: type,
      base64: btoa(String.fromCharCode(...bytes)),
    });
    const image = within(
      screen.getByRole("region", { name: "Bannière de l’offre" }),
    ).getByRole("img");
    expect(image).toHaveAttribute("src", `data:${type};base64,${data.base64}`);
    expect(
      http.mock.calls.some(
        ([url, options]) =>
          url === `${path}/banner` && options.method === "GET",
      ),
    ).toBe(true);
  },
);
it("ne charge jamais la route publique d’un import masqué pendant la lecture privée", async () => {
  const image = deferred();
  setup((url) => {
    if (url === path)
      return response(200, {
        ...original,
        articleImage: `https://feezit.example.test/api/promos/${promo}/banner`,
      });
    if (url === `${path}/banner`) return image.promise;
  });
  await screen.findByRole("form", { name: "Modifier la bannière de l’offre" });
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  await act(async () =>
    image.resolve(
      response(200, {
        url: `https://feezit.example.test/api/promos/${promo}/banner`,
        contentType: "image/png",
        base64: "iVBORw0KGgo=",
      }),
    ),
  );
  expect(await screen.findByRole("img")).toHaveAttribute(
    "src",
    "data:image/png;base64,iVBORw0KGgo=",
  );
});
it.each(["en attente", "échoué"])(
  "UUID de navigation uppercase : aucun img public avec GET privé %s",
  async (state) => {
    const navigationId = "ABCDEFAB-1234-5678-9ABC-ABCDEFABCDEF";
    const id = navigationId.toLowerCase();
    const detailPath = `/office-api/management/promos/${navigationId}`;
    const image = deferred();
    const http = setup((url) => {
      if (url === detailPath)
        return response(200, {
          ...original,
          id,
          articleImage: `https://feezit.example.test/api/promos/${id}/banner`,
        });
      if (url === `${detailPath}/banner`)
        return state === "en attente" ? image.promise : response(502, {});
    }, navigationId);
    await screen.findByRole("form", {
      name: "Modifier la bannière de l’offre",
    });
    if (state === "échoué")
      await screen.findByText(/Aperçu privé indisponible/);
    expect(window.location.hash).toBe(`#/offres?promoId=${navigationId}`);
    await waitFor(() =>
      expect(
        http.mock.calls.some(([url]) => url === `${detailPath}/banner`),
      ).toBe(true),
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(puts(http)).toHaveLength(0);
    if (state === "en attente") {
      await act(async () =>
        image.resolve(
          response(200, {
            url: `https://feezit.example.test/api/promos/${id}/banner`,
            contentType: "image/png",
            base64: "iVBORw0KGgo=",
          }),
        ),
      );
      expect(await screen.findByRole("img")).toHaveAttribute(
        "src",
        "data:image/png;base64,iVBORw0KGgo=",
      );
    }
  },
);
it("Relire après acceptation partielle conserve un nouveau fichier sans réémettre PUT", async () => {
  let accepted = false,
    fail = true;
  const http = setup((url, options) => {
    if (url === `${path}/banner` && options.method === "PUT") {
      accepted = true;
      return response(200, original);
    }
    if (url === path && accepted && fail) return response(502, {});
  });
  const form = await banner();
  await confirm(form);
  await form.findByText(/Enregistrement accepté/);
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  await userEvent.upload(
    form.getByLabelText("Importer PNG/JPEG (1 MiB maximum)"),
    new File([bytes], "nouveau.png", { type: "image/png" }),
  );
  await form.findByText(/nouveau.png/);
  fail = false;
  await userEvent.click(form.getByRole("button", { name: "Relire" }));
  await form.findByText(/Bannière enregistrée et relue/);
  expect(form.getByText(/nouveau.png/)).toBeInTheDocument();
  expect(puts(http)).toHaveLength(1);
});
it.each(["draft", "published", "masked"])(
  "efface la bannière sans altérer %s, description ni destination",
  async (publicationStatus) => {
    let record = {
      ...original,
      publicationStatus,
      destinationUrl: "https://merchant.test/current",
    };
    const http = setup((url, options) => {
      if (url === path) return response(200, record);
      if (url === `${path}/banner` && options.method === "PUT") {
        expect(JSON.parse(options.body)).toEqual({ url: "" });
        record = { ...record, articleImage: "" };
        return response(200, record);
      }
      if (url === `${path}/banner`)
        return response(200, {
          url: record.articleImage,
          contentType: null,
          base64: null,
        });
    });
    const form = await banner();
    await confirm(form, "Effacer la bannière");
    await form.findByText(/Bannière enregistrée et relue/);
    expect(form.getByLabelText("Image de l’article (URL)")).toHaveValue("");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(record).toMatchObject({
      publicationStatus,
      articleDescription: original.articleDescription,
      destinationUrl: "https://merchant.test/current",
    });
    expect(puts(http)).toHaveLength(1);
  },
);
it.each([
  ["image/svg+xml", new Uint8Array([60, 115, 118, 103]), /PNG ou JPEG/],
  ["image/png", new Uint8Array(1048577), /1 MiB/],
  ["image/png", new Uint8Array([60, 115, 118, 103]), /Contenu du fichier/],
  ["image/jpeg", new Uint8Array(), /non vide/],
])(
  "refuse le fichier %s invalide sans mutation",
  async (type, bytes, message) => {
    const http = setup();
    const form = await banner();
    fireEvent.change(form.getByLabelText("Importer PNG/JPEG (1 MiB maximum)"), {
      target: { files: [new File([bytes], "fichier.png", { type })] },
    });
    expect(await form.findByRole("alert")).toHaveTextContent(message);
    await userEvent.click(
      form.getByRole("button", {
        name: "Enregistrer la bannière",
        exact: true,
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(puts(http)).toHaveLength(0);
    await userEvent.click(
      form.getByRole("button", { name: "Utiliser une URL" }),
    );
    expect(form.getByLabelText("Image de l’article (URL)")).toBeEnabled();
    await confirm(form);
    await form.findByText(/Bannière enregistrée et relue/);
    expect(
      puts(http).map(([url, options]) => [url, JSON.parse(options.body)]),
    ).toEqual([[`${path}/banner`, { url: original.articleImage }]]);
  },
);
it("un refus serveur conserve l’import sans annoncer la persistance", async () => {
  const http = setup((url, options) =>
    url === `${path}/banner` && options.method === "PUT"
      ? response(413, {})
      : undefined,
  );
  const form = await banner();
  await userEvent.upload(
    form.getByLabelText("Importer PNG/JPEG (1 MiB maximum)"),
    new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      "garder.png",
      { type: "image/png" },
    ),
  );
  await confirm(form);
  await form.findByRole("alert");
  expect(form.getByText(/garder.png/)).toBeInTheDocument();
  expect(
    form.queryByText(/Bannière enregistrée et relue/),
  ).not.toBeInTheDocument();
  expect(puts(http)).toHaveLength(1);
});
it("sauvegarde la description seule après une nouvelle bannière sans renvoyer une ancienne URL", async () => {
  const http = setup();
  const form = await banner();
  const content = within(
    screen.getByRole("form", { name: "Modifier le contenu de l’offre" }),
  );
  fireEvent.change(content.getByLabelText("Description de l’article"), {
    target: { value: "Description dirty" },
  });
  fireEvent.change(form.getByLabelText("Image de l’article (URL)"), {
    target: { value: "https://images.example.test/recent.png" },
  });
  await confirm(form);
  await form.findByText(/Bannière enregistrée et relue/);
  await confirm(content, "Enregistrer le contenu");
  await content.findByText(/Contenu enregistré et relu/);
  expect(
    puts(http).map(([url, options]) => [url, JSON.parse(options.body)]),
  ).toEqual([
    [`${path}/banner`, { url: "https://images.example.test/recent.png" }],
    [`${path}/description`, { articleDescription: "Description dirty" }],
  ]);
  expect(form.getByLabelText("Image de l’article (URL)")).toHaveValue(
    "https://images.example.test/recent.png",
  );
});
it("une ancienne lecture privée ne remplace pas l’import confirmé", async () => {
  const stale = deferred();
  let reads = 0;
  const http = setup((url, options) =>
    url === `${path}/banner` && options.method === "GET" && ++reads === 1
      ? stale.promise
      : undefined,
  );
  const form = await banner();
  await userEvent.upload(
    form.getByLabelText("Importer PNG/JPEG (1 MiB maximum)"),
    new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      "recent.png",
      { type: "image/png" },
    ),
  );
  await confirm(form);
  await form.findByText(/Bannière enregistrée et relue/);
  await act(async () =>
    stale.resolve(
      response(200, {
        url: original.articleImage,
        contentType: null,
        base64: null,
      }),
    ),
  );
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    "data:image/png;base64,iVBORw0KGgo=",
  );
  expect(puts(http)).toHaveLength(1);
});
it.each(["offre", "logout"])(
  "ignore un PUT image tardif après changement %s",
  async (mode) => {
    const late = deferred();
    setup((url, options) => {
      if (url === `${path}/banner` && options.method === "PUT")
        return late.promise;
      if (url === `/office-api/management/promos/${owner}`)
        return response(200, {
          ...original,
          id: owner,
          articleImage: "",
          articleDescription: "Autre offre",
        });
    });
    const form = await banner();
    await confirm(form);
    if (mode === "logout") {
      await userEvent.click(
        screen.getByRole("button", { name: "Se déconnecter" }),
      );
      await screen.findByRole("heading", { name: "Connexion opérateur" });
    } else {
      await act(async () => {
        window.location.hash = `#/offres?promoId=${owner}`;
      });
      await screen.findByText("Autre offre", { selector: "p" });
    }
    await act(async () =>
      late.resolve(
        response(200, {
          ...original,
          articleImage: "https://images.test/late.png",
        }),
      ),
    );
    expect(
      screen.queryByText(/Bannière enregistrée et relue/),
    ).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(
      "https://images.test/late.png",
    );
  },
);
it("remplace l’URL par la route dédiée sans sauvegarder le brouillon description ni publier", async () => {
  const http = setup();
  const form = await banner();
  const content = within(
    screen.getByRole("form", { name: "Modifier le contenu de l’offre" }),
  );
  fireEvent.change(content.getByLabelText("Description de l’article"), {
    target: { value: "Brouillon indépendant" },
  });
  fireEvent.change(form.getByLabelText("Image de l’article (URL)"), {
    target: { value: "https://images.example.test/new.png" },
  });
  await confirm(form);
  await form.findByText(/Bannière enregistrée et relue/);
  expect(
    puts(http).map(([url, options]) => [url, JSON.parse(options.body)]),
  ).toEqual([
    [`${path}/banner`, { url: "https://images.example.test/new.png" }],
  ]);
  expect(content.getByLabelText("Description de l’article")).toHaveValue(
    "Brouillon indépendant",
  );
  expect(screen.getByText(/Exact · Masqué/)).toBeInTheDocument();
  expect(
    content.queryByLabelText("Image de l’article (URL)"),
  ).not.toBeInTheDocument();
});

it("ignore un fichier terminé après choix d’une URL plus récente", async () => {
  let reader;
  const spy = vi
    .spyOn(FileReader.prototype, "readAsDataURL")
    .mockImplementation(function () {
      reader = this;
    });
  try {
    const http = setup();
    const form = await banner();
    await userEvent.upload(
      form.getByLabelText("Importer PNG/JPEG (1 MiB maximum)"),
      new File(
        [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
        "ancien.png",
        { type: "image/png" },
      ),
    );
    await form.findByText("Lecture du fichier…");
    await userEvent.click(
      form.getByRole("button", { name: "Utiliser une URL" }),
    );
    fireEvent.change(form.getByLabelText("Image de l’article (URL)"), {
      target: { value: "https://images.example.test/recent.png" },
    });
    await act(async () => {
      Object.defineProperty(reader, "result", {
        value: "data:image/png;base64,iVBORw0KGgo=",
      });
      reader.onload();
    });
    expect(form.queryByText(/ancien.png/)).not.toBeInTheDocument();
    await confirm(form);
    await form.findByText(/Bannière enregistrée et relue/);
    expect(JSON.parse(puts(http)[0][1].body)).toEqual({
      url: "https://images.example.test/recent.png",
    });
  } finally {
    spy.mockRestore();
  }
});
it("GET privé échoué après PUT accepté impose Relire sans seconde mutation", async () => {
  let accepted = false,
    fail = true;
  const http = setup((url, options) => {
    if (url === `${path}/banner` && options.method === "PUT") {
      accepted = true;
      return response(200, original);
    }
    if (
      url === `${path}/banner` &&
      options.method === "GET" &&
      accepted &&
      fail
    )
      return response(502, {});
  });
  const form = await banner();
  await confirm(form);
  await form.findByText(/Enregistrement accepté/);
  expect(
    form.getByRole("button", { name: "Enregistrer la bannière", exact: true }),
  ).toBeDisabled();
  fireEvent.change(form.getByLabelText("Image de l’article (URL)"), {
    target: { value: "https://images.test/draft.png" },
  });
  fail = false;
  await userEvent.click(form.getByRole("button", { name: "Relire" }));
  await form.findByText(/Bannière enregistrée et relue/);
  expect(form.getByLabelText("Image de l’article (URL)")).toHaveValue(
    "https://images.test/draft.png",
  );
  expect(puts(http)).toHaveLength(1);
  expect(puts(http)[0][1].headers["X-CSRF-TOKEN"]).toBeTruthy();
});

it.each([
  [413, /trop volumineux/i],
  [415, /format.*non pris en charge/i],
])(
  "explique le refus HTTP %i sans exposer le corps serveur",
  async (status, message) => {
    setup((url, options) =>
      url === `${path}/banner` && options.method === "PUT"
        ? response(status, { message: "secret-upstream-synthetic" })
        : undefined,
    );
    const form = await banner();
    await confirm(form);
    expect(await form.findByRole("alert")).toHaveTextContent(message);
    expect(document.body.textContent).not.toContain(
      "secret-upstream-synthetic",
    );
  },
);
