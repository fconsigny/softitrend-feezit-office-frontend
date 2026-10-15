import { it, expect } from "vitest";
import { render, screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, promo, response, deferred } from "./http.js";

it("pagine outbox côté serveur et montre la couverture limitée du moniteur", async () => {
  window.location.hash = "#/notifications";
  const http = httpBoundary((url) => {
    if (url.includes("/outbox-page?"))
      return response(200, {
        items: [
          {
            id: promo,
            deliveryStatus: "pending",
            deliveryReference: url.includes("page=1") ? "Page-deux" : "sent",
            createdAt: "2026-10-12T12:00:00Z",
            sentAt: null,
          },
        ],
        total: 121,
        page: url.includes("page=1") ? 1 : 0,
        size: 20,
      });
    if (url.endsWith("/email-deliveries"))
      return response(200, [
        { id: "synthetic", status: "uncertain", smtpReference: "constructor" },
      ]);
    if (url.endsWith("/operations-status"))
      return response(200, {
        emailTransportEnabled: true,
        participationJobsEnabled: false,
        observedAt: "2026-10-13T09:30:00Z",
      });
  });
  render(<App client={createOfficeClient(http)} />);
  const outbox = within(
    await screen.findByRole("region", { name: "Outbox · notifications" }),
  );
  expect(await outbox.findByText(/121 résultats/)).toBeInTheDocument();
  expect(outbox.getByText("sent")).toBeInTheDocument();
  expect(outbox.queryByLabelText("Rechercher")).not.toBeInTheDocument();
  await userEvent.click(outbox.getByRole("button", { name: "Page suivante" }));
  expect(await outbox.findByText("Page-deux")).toBeInTheDocument();
  expect(
    http.mock.calls.some(
      ([url]) => url === "/office-api/management/outbox-page?page=1&size=20",
    ),
  ).toBe(true);
  expect(http.mock.calls.some(([url]) => url.endsWith("/outbox"))).toBe(false);
  const monitor = within(
    screen.getByRole("region", { name: "Suivi du transport email" }),
  );
  expect(monitor.getByText(/100 dernières notifications/)).toHaveTextContent(
    /pas.*total historique/i,
  );
  expect(monitor.getByText("Résultat incertain")).toBeInTheDocument();
  const configuration = within(
    screen.getByRole("region", { name: "Configuration opérationnelle" }),
  );
  expect(
    configuration.getByText("Transport email").nextElementSibling,
  ).toHaveTextContent("Activé");
  expect(
    configuration.getByText("Échéances planifiées").nextElementSibling,
  ).toHaveTextContent("Désactivées");
  expect(configuration.getByText("13/10/2026 09:30 UTC")).toBeInTheDocument();
  expect(configuration.getByText(/ni.*preuve d’envoi/i)).toBeInTheDocument();
  expect(
    screen.queryByRole("form", { name: "Attester une émission réelle" }),
  ).not.toBeInTheDocument();
  expect(http.mock.calls.some(([url]) => url.endsWith("/jobs/run"))).toBe(
    false,
  );
});
it("une configuration indisponible ne devient pas transport désactivé ou liste vide", async () => {
  window.location.hash = "#/notifications";
  render(
    <App
      client={createOfficeClient(
        httpBoundary((url) =>
          url.endsWith("/operations-status") || url.includes("/outbox-page?")
            ? response(502, {})
            : undefined,
        ),
      )}
    />,
  );
  const configuration = within(
    await screen.findByRole("region", { name: "Configuration opérationnelle" }),
  );
  expect(await configuration.findByRole("alert")).toHaveTextContent(
    "indisponible",
  );
  expect(configuration.queryByText("Désactivé")).not.toBeInTheDocument();
  const outbox = within(
    screen.getByRole("region", { name: "Outbox · notifications" }),
  );
  expect(await outbox.findByRole("alert")).toBeInTheDocument();
  expect(outbox.queryByText(/0 résultats/)).not.toBeInTheDocument();
});
it("ignore une page de notifications tardive après déconnexion", async () => {
  window.location.hash = "#/notifications";
  const late = deferred();
  const http = httpBoundary((url) =>
    url.includes("/outbox-page?") ? late.promise : undefined,
  );
  render(<App client={createOfficeClient(http)} />);
  await screen.findByRole("navigation");
  await waitFor(() =>
    expect(http.mock.calls.some(([url]) => url.includes("/outbox-page?"))).toBe(
      true,
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
  await screen.findByRole("heading", { name: "Connexion opérateur" });
  await act(async () =>
    late.resolve(
      response(200, {
        items: [{ recipient: "private@example.test" }],
        total: 1,
      }),
    ),
  );
  expect(screen.queryByText("private@example.test")).not.toBeInTheDocument();
});
