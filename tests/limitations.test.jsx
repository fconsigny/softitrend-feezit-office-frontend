import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, owner, promo, response } from "./http.js";
it("préserve les champs incidents absents sans inventer un type ou une date d’ouverture", async () => {
  window.location.hash = "#/moderation";
  render(
    <App
      client={createOfficeClient(
        httpBoundary((url) =>
          url.includes("/incidents?")
            ? response(200, {
                items: [
                  {
                    id: promo,
                    promoId: promo,
                    ownerId: owner,
                    kind: null,
                    openedAt: null,
                    firstSentAt: null,
                  },
                ],
                total: 1,
                page: 0,
                size: 20,
              })
            : undefined,
        ),
      )}
    />,
  );
  expect(
    await screen.findByText(
      /type et date d’ouverture peuvent ne pas être fournis/i,
    ),
  ).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: "Examiner" })).toHaveAttribute(
    "href",
    `#/moderation?promoId=${promo}&ownerId=${owner}`,
  );
  expect(screen.queryByText("Invalidation")).not.toBeInTheDocument();
});
it("une émission au résultat incertain n’est jamais présentée comme envoyée", async () => {
  window.location.hash = "#/notifications";
  render(
    <App
      client={createOfficeClient(
        httpBoundary((url) =>
          url.endsWith("/email-deliveries")
            ? response(200, [
                {
                  id: promo,
                  kind: "invalid_first",
                  status: "uncertain",
                  sentAt: null,
                },
              ])
            : undefined,
        ),
      )}
    />,
  );
  expect(await screen.findByText("Résultat incertain")).toBeInTheDocument();
  expect(screen.queryByText("Émission attestée")).not.toBeInTheDocument();
});

it("ne confond pas l’identifiant d’incident avec l’identifiant de l’offre lorsque promoId manque", async () => {
  window.location.hash = "#/moderation";
  render(
    <App
      client={createOfficeClient(
        httpBoundary((url) =>
          url.includes("/incidents?")
            ? response(200, {
                items: [{ id: promo, ownerId: owner }],
                total: 1,
                page: 0,
                size: 20,
              })
            : undefined,
        ),
      )}
    />,
  );
  expect(await screen.findByRole("link", { name: "Examiner" })).toHaveAttribute(
    "href",
    `#/moderation?promoId=&ownerId=${owner}`,
  );
});
