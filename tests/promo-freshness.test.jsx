import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { deferred, owner, promo, response } from "./http.js";

// Only the HTTP boundary is controlled: real App, editors, hooks and client.
const D0 = "https://merchant.invalid/destination-0";
const D1 = "https://merchant.invalid/destination-1";
const initial = {
  id: promo,
  ownerId: owner,
  store: "Synthetic merchant",
  code: "SYNTHETIC",
  publicationStatus: "masked",
  status: "expired",
  articleName: "Fixture",
  articleDescription: "Initial",
  articleImage: "",
  destinationUrl: D0,
  conditions: "Synthetic only",
  startDate: "2026-01-01",
  endDate: "2026-01-02",
};
const unexpected = [];
afterEach(() => expect(unexpected.splice(0)).toEqual([]));
function setup(handler) {
  window.location.hash = `#/offres?promoId=${promo}`;
  let signedIn = true;
  const http = vi.fn(async (url, options) => {
    const { method } = options;
    expect(options.credentials).toBe("same-origin");
    expect(options.cache).toBe("no-store");
    if (method !== "GET")
      expect(options.headers["X-CSRF-TOKEN"]).toBe("synthetic-csrf");
    const custom = handler(url, options);
    if (custom !== undefined) return custom;
    if (method === "GET" && url === "/office-api/csrf")
      return response(200, {
        headerName: "X-CSRF-TOKEN",
        token: "synthetic-csrf",
      });
    if (method === "GET" && url === "/office-api/session")
      return response(signedIn ? 200 : 401, { username: "synthetic-office" });
    if (method === "POST" && url === "/office-api/auth/logout") {
      signedIn = false;
      return response(204);
    }
    if (
      method === "GET" &&
      ["promos", "accounts"].some(
        (p) => url === `/office-api/management/${p}?page=0&size=20&q=`,
      )
    )
      return response(200, { items: [], total: 0, page: 0, size: 20 });
    if (
      method === "GET" &&
      url === `/office-api/management/promos/${promo}/participation`
    )
      return response(200, {
        promoId: promo,
        ownerId: owner,
        agreementReceivedAt: null,
        agreementReference: "Synthetic",
        documentVersion: "fixture",
        reservationExpiresAt: null,
      });
    if (method === "GET" && /\/promos\/[^/]+\/banner$/.test(url))
      return response(200, { url: "", contentType: null, base64: null });
    unexpected.push(`${method} ${url}`);
    throw new Error(`Unexpected HTTP: ${method} ${url}`);
  });
  render(<App client={createOfficeClient(http)} />);
  return http;
}
const detailPath = `/office-api/management/promos/${promo}`;
async function forms() {
  const destination = within(
    await screen.findByRole("form", {
      name: "Modifier la destination de l’offre",
    }),
  );
  const content = within(
    screen.getByRole("form", { name: "Modifier le contenu de l’offre" }),
  );
  await waitFor(() =>
    expect(destination.getByLabelText("Destination (URL HTTP/S)")).toHaveValue(
      D0,
    ),
  );
  return { destination, content, description: content };
}
function input(form, label, value) {
  fireEvent.change(form.getByLabelText(label), { target: { value } });
}
async function openConfirmation(form, name) {
  await userEvent.click(form.getByRole("button", { name }));
  const dialog = within(await screen.findByRole("dialog"));
  await userEvent.click(dialog.getByLabelText("Je confirme cette opération"));
  return dialog;
}
async function confirm(form, name) {
  const dialog = await openConfirmation(form, name);
  await userEvent.click(
    dialog.getByRole("button", { name: "Confirmer", exact: true }),
  );
}
function expectDestination(destination, value = D1) {
  expect(destination.getByLabelText("Destination (URL HTTP/S)")).toHaveValue(
    value,
  );
  const details = within(
    screen.getByRole("region", { name: "Détail de l’offre" }),
  );
  expect(
    details.getByText("Destination enregistrée").nextElementSibling,
  ).toHaveTextContent(D1);
}
function expectPuts(http, suffixes) {
  const puts = http.mock.calls.filter(
    ([, options]) => options.method === "PUT",
  );
  expect(puts.map(([url]) => url)).toEqual(
    suffixes.map((s) => `${detailPath}/${s}`),
  );
}

it.each([
  [
    "destination",
    "Destination (URL HTTP/S)",
    "Enregistrer la destination",
    "destinationUrl",
    D1,
    "https://merchant.invalid/unsaved-2",
  ],
  [
    "description",
    "Description de l’article",
    "Enregistrer le contenu",
    "articleDescription",
    "Contenu confirmé",
    "Contenu plus récent",
  ],
])(
  "R03 nouvelle saisie: %s modifié pendant la confirmation conserve le nouveau brouillon",
  async (suffix, label, button, field, sent, newer) => {
    const verification = deferred();
    let reads = 0,
      saved = { ...initial };
    const http = setup((url, options) => {
      if (url === `${detailPath}/${suffix}` && options.method === "PUT") {
        const payload = JSON.parse(options.body);
        expect(payload[field]).toBe(sent);
        saved = { ...saved, ...payload };
        return response(200, saved);
      }
      if (url === detailPath && options.method === "GET") {
        reads++;
        return reads === 2 ? verification.promise : response(200, saved);
      }
    });
    const selected = (await forms())[suffix];
    input(selected, label, sent);
    const dialog = await openConfirmation(selected, button);
    input(selected, label, newer);
    await userEvent.click(
      dialog.getByRole("button", { name: "Confirmer", exact: true }),
    );
    await waitFor(() => expect(reads).toBe(2));
    await act(async () => verification.resolve(response(200, saved)));
    await selected.findByRole("status");
    expect(selected.getByLabelText(label)).toHaveValue(newer);
    expectPuts(http, [suffix]);
  },
);

it("R03: deux états partiels restent indépendants, nouvelles saisies et Relire GET seul", async () => {
  let record = { ...initial },
    failRead = false;
  const http = setup((url, options) => {
    if (
      options.method === "PUT" &&
      ["description", "destination"].some((s) => url === `${detailPath}/${s}`)
    ) {
      record = { ...record, ...JSON.parse(options.body) };
      failRead = true;
      return response(200, record);
    }
    if (url === detailPath && options.method === "GET")
      return failRead ? response(502, {}) : response(200, { ...record });
  });
  const { content, destination } = await forms();
  input(content, "Description de l’article", "Contenu accepté");
  await confirm(content, "Enregistrer le contenu");
  await content.findByRole("button", { name: "Relire", exact: true });
  input(destination, "Destination (URL HTTP/S)", D1);
  await confirm(destination, "Enregistrer la destination");
  await destination.findByRole("button", { name: "Relire", exact: true });
  input(content, "Description de l’article", "Contenu dirty");
  const D2 = "https://merchant.invalid/dirty-2";
  input(destination, "Destination (URL HTTP/S)", D2);
  failRead = false;
  await userEvent.click(
    content.getByRole("button", { name: "Relire", exact: true }),
  );
  await content.findByText(/Contenu enregistré et relu/);
  expect(destination.getByRole("alert")).toHaveTextContent(
    /enregistrement accepté.*relecture.*échoué/i,
  );
  expect(
    destination.getByRole("button", { name: "Enregistrer la destination" }),
  ).toBeDisabled();
  expectDestination(destination, D2);
  await userEvent.click(
    destination.getByRole("button", { name: "Relire", exact: true }),
  );
  await destination.findByText(/Destination enregistrée et relue/);
  expectDestination(destination, D2);
  expect(content.getByLabelText("Description de l’article")).toHaveValue(
    "Contenu dirty",
  );
  expectPuts(http, ["description", "destination"]);
});

it.each(["PUT", "GET"])(
  "R03: nouvelle saisie pendant %s en attente ne disparaît pas à sa complétion",
  async (stage) => {
    const late = deferred();
    let reads = 0;
    const saved = { ...initial, destinationUrl: D1 };
    const http = setup((url, options) => {
      if (url === `${detailPath}/destination` && options.method === "PUT")
        return stage === "PUT" ? late.promise : response(200, saved);
      if (url === detailPath && options.method === "GET") {
        reads++;
        if (reads === 1) return response(200, initial);
        return stage === "GET" && reads === 2
          ? late.promise
          : response(200, saved);
      }
    });
    const { content, destination } = await forms();
    input(destination, "Destination (URL HTTP/S)", D1);
    await confirm(destination, "Enregistrer la destination");
    if (stage === "GET") await waitFor(() => expect(reads).toBe(2));
    // Native UI disables the mutating field. The other draft remains editable;
    // a synthetic change also exercises the guard against queued input events.
    expect(
      destination.getByLabelText("Destination (URL HTTP/S)"),
    ).toBeDisabled();
    input(
      content,
      "Description de l’article",
      "Saisi pendant la requête destination",
    );
    const newer = "https://merchant.invalid/queued-input";
    input(destination, "Destination (URL HTTP/S)", newer);
    await act(async () => late.resolve(response(200, saved)));
    await destination.findByText(/Destination enregistrée et relue/);
    expectDestination(destination, newer);
    expect(content.getByLabelText("Description de l’article")).toHaveValue(
      "Saisi pendant la requête destination",
    );
    expectPuts(http, ["destination"]);
  },
);

it.each(
  ["PUT", "GET"].flatMap((stage) =>
    ["offre", "logout", "401"].flatMap((transition) =>
      [200, 401].map((status) => [stage, transition, status]),
    ),
  ),
)(
  "R03 privé: %s retardé, changement %s puis ancienne réponse %i ignorée",
  async (stage, transition, status) => {
    const late = deferred();
    const nextPromo = "33333333-3333-4333-8333-333333333333";
    const nextPath = `/office-api/management/promos/${nextPromo}`;
    let reads = 0,
      expire = false,
      delayedSignal;
    const http = setup((url, options) => {
      if (url === nextPath && options.method === "GET")
        return response(200, {
          ...initial,
          id: nextPromo,
          articleDescription: "Nouvelle offre",
          destinationUrl: "https://merchant.invalid/other",
        });
      if (url === `${nextPath}/participation` && options.method === "GET")
        return response(200, { promoId: nextPromo, ownerId: owner });
      if (
        expire &&
        url === "/office-api/management/accounts?page=0&size=20&q=" &&
        options.method === "GET"
      )
        return response(401, {});
      if (url === `${detailPath}/destination` && options.method === "PUT") {
        if (stage === "PUT") {
          delayedSignal = options.signal;
          return late.promise;
        }
        return response(200, { ...initial, destinationUrl: D1 });
      }
      if (url === detailPath && options.method === "GET") {
        reads++;
        if (stage === "GET" && reads === 2) {
          delayedSignal = options.signal;
          return late.promise;
        }
        return response(200, initial);
      }
    });
    const { destination } = await forms();
    input(destination, "Destination (URL HTTP/S)", D1);
    await confirm(destination, "Enregistrer la destination");
    await waitFor(() => expect(delayedSignal).toBeDefined());
    if (transition === "offre") {
      await act(async () => {
        window.location.hash = `#/offres?promoId=${nextPromo}`;
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
      await screen.findByDisplayValue("Nouvelle offre");
    } else if (transition === "logout") {
      await userEvent.click(
        screen.getByRole("button", { name: "Se déconnecter" }),
      );
      await screen.findByRole("heading", { name: "Connexion opérateur" });
    } else {
      expire = true;
      await userEvent.click(screen.getByRole("button", { name: "Actualiser" }));
      await screen.findByRole("heading", { name: "Connexion opérateur" });
    }
    expect(delayedSignal.aborted).toBe(true);
    await act(async () =>
      late.resolve(
        response(status, {
          ...initial,
          destinationUrl: D1,
          articleDescription: "ANCIENNE DONNEE PRIVEE",
        }),
      ),
    );
    expect(
      screen.queryByText(/ANCIENNE DONNEE PRIVEE/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Destination enregistrée et relue/),
    ).not.toBeInTheDocument();
    if (transition === "offre") {
      expect(screen.getByDisplayValue("Nouvelle offre")).toBeInTheDocument();
      expect(screen.getByLabelText("Destination (URL HTTP/S)")).toHaveValue(
        "https://merchant.invalid/other",
      );
      expect(
        screen.queryByRole("heading", { name: "Connexion opérateur" }),
      ).not.toBeInTheDocument();
    } else {
      expect(
        screen.getByRole("heading", { name: "Connexion opérateur" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: "Contenu de l’offre" }),
      ).not.toBeInTheDocument();
    }
    expectPuts(http, ["destination"]);
  },
);

it("R01: D1 confirmé ne régresse pas lorsque le GET parent de révision échoue 502", async () => {
  const parent = deferred();
  let reads = 0;
  const http = setup((url, options) => {
    if (url === `${detailPath}/destination` && options.method === "PUT") {
      expect(JSON.parse(options.body)).toEqual({ destinationUrl: D1 });
      return response(200, { ...initial, destinationUrl: D1 });
    }
    if (url === detailPath && options.method === "GET") {
      reads++;
      if (reads === 3) return parent.promise;
      return response(200, {
        ...initial,
        destinationUrl: reads === 1 ? D0 : D1,
      });
    }
  });
  const { destination, content } = await forms();
  input(content, "Description de l’article", "Contenu dirty indépendant");
  input(destination, "Destination (URL HTTP/S)", D1);
  await confirm(destination, "Enregistrer la destination");
  await destination.findByText(/Destination enregistrée et relue/);
  await waitFor(() => expect(reads).toBe(3));
  await act(async () => parent.resolve(response(502, {})));
  await content.findByRole("alert");
  expectDestination(destination);
  expect(content.getByLabelText("Description de l’article")).toHaveValue(
    "Contenu dirty indépendant",
  );
  expect(destination.getByRole("status")).toHaveTextContent(
    "Destination enregistrée et relue",
  );
  expectPuts(http, ["destination"]);
});

it("R02: contenu partiel et D1 confirmé restent indépendants ; Relire fait seulement GET", async () => {
  let record = { ...initial },
    reads = 0;
  const http = setup((url, options) => {
    if (
      options.method === "PUT" &&
      ["description", "destination"].some((s) => url === `${detailPath}/${s}`)
    ) {
      record = { ...record, ...JSON.parse(options.body) };
      return response(200, record);
    }
    if (url === detailPath && options.method === "GET") {
      reads++;
      return reads === 2 ? response(502, {}) : response(200, { ...record });
    }
  });
  const { content, destination } = await forms();
  input(content, "Description de l’article", "Contenu accepté");
  await confirm(content, "Enregistrer le contenu");
  expect(await content.findByRole("alert")).toHaveTextContent(
    /enregistrement accepté.*relecture.*échoué/i,
  );
  input(
    content,
    "Description de l’article",
    "Brouillon contenu après acceptation",
  );
  input(destination, "Destination (URL HTTP/S)", D1);
  await confirm(destination, "Enregistrer la destination");
  await destination.findByText(/Destination enregistrée et relue/);
  expectDestination(destination);
  expect(content.getByLabelText("Description de l’article")).toHaveValue(
    "Brouillon contenu après acceptation",
  );
  expect(content.getByRole("alert")).toHaveTextContent(
    /enregistrement accepté.*relecture.*échoué/i,
  );
  expect(
    content.getByRole("button", { name: "Enregistrer le contenu" }),
  ).toBeDisabled();
  expect(
    destination.queryByRole("button", { name: "Relire" }),
  ).not.toBeInTheDocument();
  expect(reads).toBe(3);
  const D2 = "https://merchant.invalid/unsaved-destination";
  input(destination, "Destination (URL HTTP/S)", D2);
  await userEvent.click(
    content.getByRole("button", { name: "Relire", exact: true }),
  );
  await content.findByText(/Contenu enregistré et relu/);
  expectDestination(destination, D2);
  expect(content.getByLabelText("Description de l’article")).toHaveValue(
    "Brouillon contenu après acceptation",
  );
  expect(
    content.queryByRole("button", { name: "Relire" }),
  ).not.toBeInTheDocument();
  expectPuts(http, ["description", "destination"]);
});

it.each([
  ["avant", "parent puis vérification"],
  ["avant", "vérification puis parent"],
  ["pendant", "parent puis vérification"],
  ["pendant", "vérification puis parent"],
])(
  "R03: GET parent %s PUT destination, complétion %s",
  async (start, order) => {
    const parent = deferred(),
      put = deferred(),
      verified = deferred();
    let reads = 0;
    const http = setup((url, options) => {
      if (url === `${detailPath}/destination` && options.method === "PUT")
        return put.promise;
      if (url === detailPath && options.method === "GET") {
        reads++;
        if (reads === 1) return response(200, initial);
        if (reads === 2) return parent.promise;
        if (reads === 3) return verified.promise;
        return response(502, {});
      }
    });
    const { content, destination } = await forms();
    input(
      content,
      "Description de l’article",
      "Contenu dirty pendant la course",
    );
    input(destination, "Destination (URL HTTP/S)", D1);
    const dialog = await openConfirmation(
      destination,
      "Enregistrer la destination",
    );
    if (start === "avant")
      fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    await userEvent.click(
      dialog.getByRole("button", { name: "Confirmer", exact: true }),
    );
    if (start === "pendant")
      fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    await waitFor(() => expect(reads).toBe(2));
    await act(async () =>
      put.resolve(response(200, { ...initial, destinationUrl: D1 })),
    );
    await waitFor(() => expect(reads).toBe(3));
    const first = order === "parent puis vérification" ? parent : verified;
    const second = order === "parent puis vérification" ? verified : parent;
    const complete = (request) =>
      request.resolve(
        response(
          200,
          request === parent ? initial : { ...initial, destinationUrl: D1 },
        ),
      );
    // Drain the first HTTP response while React batches its state updates. This
    // also exercises the interval before revision-effect cleanup can abort GET.
    await act(async () => {
      complete(first);
      for (let step = 0; step < 12; step++) await Promise.resolve();
      complete(second);
    });
    await destination.findByText(/Destination enregistrée et relue/);
    await content.findByRole("alert");
    expectDestination(destination);
    expect(content.getByLabelText("Description de l’article")).toHaveValue(
      "Contenu dirty pendant la course",
    );
    expectPuts(http, ["destination"]);
  },
);

it.each([
  ["avant", "parent puis vérification"],
  ["avant", "vérification puis parent"],
  ["pendant", "parent puis vérification"],
  ["pendant", "vérification puis parent"],
])(
  "R03 partiel: Relire contenu %s PUT destination, complétion %s",
  async (start, order) => {
    const parent = deferred(),
      put = deferred(),
      verified = deferred();
    let reads = 0,
      retryCurrent = false;
    const savedContent = { ...initial, articleDescription: "Contenu accepté" };
    const current = { ...savedContent, destinationUrl: D1 };
    const http = setup((url, options) => {
      if (url === `${detailPath}/description` && options.method === "PUT")
        return response(200, savedContent);
      if (url === `${detailPath}/destination` && options.method === "PUT")
        return put.promise;
      if (url === detailPath && options.method === "GET") {
        reads++;
        if (reads === 1) return response(200, initial);
        if (reads === 2) return response(502, {});
        if (reads === 3) return parent.promise;
        if (reads === 4) return verified.promise;
        return retryCurrent ? response(200, current) : response(502, {});
      }
    });
    const { content, destination } = await forms();
    input(content, "Description de l’article", "Contenu accepté");
    await confirm(content, "Enregistrer le contenu");
    await content.findByRole("button", { name: "Relire", exact: true });
    input(content, "Description de l’article", "Nouveau contenu dirty");
    input(destination, "Destination (URL HTTP/S)", D1);
    const dialog = await openConfirmation(
      destination,
      "Enregistrer la destination",
    );
    if (start === "avant")
      fireEvent.click(
        content.getByRole("button", { name: "Relire", exact: true }),
      );
    await userEvent.click(
      dialog.getByRole("button", { name: "Confirmer", exact: true }),
    );
    if (start === "pendant")
      fireEvent.click(
        content.getByRole("button", { name: "Relire", exact: true }),
      );
    await waitFor(() => expect(reads).toBe(3));
    await act(async () => put.resolve(response(200, current)));
    await waitFor(() => expect(reads).toBe(4));
    const complete = (request) =>
      request.resolve(
        response(200, request === parent ? savedContent : current),
      );
    await act(async () => {
      complete(order === "parent puis vérification" ? parent : verified);
      for (let step = 0; step < 12; step++) await Promise.resolve();
      complete(order === "parent puis vérification" ? verified : parent);
    });
    await destination.findByText(/Destination enregistrée et relue/);
    expectDestination(destination);
    expect(content.getByLabelText("Description de l’article")).toHaveValue(
      "Nouveau contenu dirty",
    );
    expect(content.getByRole("alert")).toHaveTextContent(
      /enregistrement accepté.*relecture/i,
    );
    expect(
      content.getByRole("button", { name: "Enregistrer le contenu" }),
    ).toBeDisabled();
    retryCurrent = true;
    await userEvent.click(
      content.getByRole("button", { name: "Relire", exact: true }),
    );
    await content.findByText(/Contenu enregistré et relu/);
    expectDestination(destination);
    expect(content.getByLabelText("Description de l’article")).toHaveValue(
      "Nouveau contenu dirty",
    );
    expectPuts(http, ["description", "destination"]);
  },
);
