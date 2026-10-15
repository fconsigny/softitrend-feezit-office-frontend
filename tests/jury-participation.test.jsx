import { it, expect } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, owner, promo, response, deferred } from "./http.js";
const offer = {
  id: promo,
  ownerId: owner,
  ownerUsername: "constructor",
  ownerName: "sent",
  store: "draft",
  code: "__proto__",
  articleName: "2026-10-12",
  category: "Création",
  destinationUrl: "https://merchant.example/offer",
  conditions: "Conditions\nsans HTML",
  publicationStatus: "masked",
  status: "expired",
  startDate: "2026-10-01",
  endDate: "2026-10-12",
  createdAt: "2026-09-01T12:00:00Z",
  articleDescription: "",
  articleImage: "",
};
function setup(handler = () => undefined) {
  window.location.hash = `#/offres?promoId=${promo}`;
  const http = httpBoundary(
    (url, options) =>
      handler(url, options) ??
      (url.endsWith(`/promos/${promo}`) ? response(200, offer) : undefined),
  );
  render(<App client={createOfficeClient(http)} />);
  return http;
}
it("relit l’accord dédié et montre toute l’offre sans confondre publication, validité et création", async () => {
  const http = setup((url) =>
    url.endsWith("/participation")
      ? response(200, {
          promoId: promo,
          ownerId: owner,
          agreementReceivedAt: "2026-10-02T09:30:00Z",
          agreementReference: "constructor",
          documentVersion: "2026-10-12",
          reservationExpiresAt: "2026-10-09T09:30:00Z",
        })
      : undefined,
  );
  const detail = within(
    await screen.findByRole("region", { name: "Détail de l’offre" }),
  );
  for (const value of [
    "draft",
    "__proto__",
    "constructor",
    "sent",
    "2026-10-12",
    "https://merchant.example/offer",
    "Masqué",
    "Expiré",
    "12/10/2026",
  ])
    expect(detail.getByText(value)).toBeInTheDocument();
  expect(detail.getByText("Publication")).toBeInTheDocument();
  expect(detail.getByText("Validité temporelle")).toBeInTheDocument();
  expect(detail.getByText(/Conditions sans HTML/)).toBeInTheDocument();
  const agreement = within(
    await screen.findByRole("region", { name: "Participation enregistrée" }),
  );
  expect(
    await agreement.findByText("02/10/2026 09:30 UTC"),
  ).toBeInTheDocument();
  expect(agreement.getByText("09/10/2026 09:30 UTC")).toBeInTheDocument();
  expect(agreement.getByText("constructor")).toBeInTheDocument();
  expect(agreement.getByText("2026-10-12")).toBeInTheDocument();
  expect(agreement.queryByText("01/09/2026 12:00 UTC")).not.toBeInTheDocument();
  expect(
    http.mock.calls.some(
      ([url]) => url === `/office-api/management/promos/${promo}/participation`,
    ),
  ).toBe(true);
});
it("signale l’accord indisponible sans bloquer le contenu ni fabriquer une date", async () => {
  setup((url) =>
    url.endsWith("/participation") ? response(502, {}) : undefined,
  );
  const agreement = within(
    await screen.findByRole("region", { name: "Participation enregistrée" }),
  );
  expect(await agreement.findByRole("alert")).toHaveTextContent("indisponible");
  expect(agreement.queryByText("01/09/2026 12:00 UTC")).not.toBeInTheDocument();
  expect(
    screen.getByRole("form", { name: "Modifier le contenu de l’offre" }),
  ).toBeInTheDocument();
});
it("ne republie pas une référence privée arrivée après logout", async () => {
  const late = deferred();
  setup((url) => (url.endsWith("/participation") ? late.promise : undefined));
  await screen.findByRole("region", { name: "Participation enregistrée" });
  await userEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
  await screen.findByRole("heading", { name: "Connexion opérateur" });
  await act(async () =>
    late.resolve(response(200, { agreementReference: "PRIVATE-LATE" })),
  );
  expect(screen.queryByText("PRIVATE-LATE")).not.toBeInTheDocument();
});
