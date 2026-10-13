import { it, expect } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, owner, response, deferred } from "./http.js";
it("affiche uniquement les visites profil et sorties promotionnelles quotidiennes pour une période ISO", async () => {
  window.location.hash = `#/stats?ownerId=${owner}`;
  const http = httpBoundary((url) =>
    url.includes("/stats?")
      ? response(200, {
          from: "2026-10-01",
          to: "2026-10-02",
          source: "feezit-events",
          measurement: "raw-events-not-unique-visitors",
          totals: {
            profile_view: 42,
            promo_outbound: 19,
            promo_copy: 888,
            link_outbound: 999,
          },
          daily: [
            {
              date: "2026-10-01",
              profile_view: 12,
              promo_outbound: 8,
              promo_copy: 777,
            },
          ],
          revenue: 666,
        })
      : undefined,
  );
  render(<App client={createOfficeClient(http)} />);
  const form = within(
    await screen.findByRole("form", { name: "Consulter les statistiques" }),
  );
  for (const [label, value] of Object.entries({
    "Du (UTC)": "2026-10-01",
    "Au (UTC)": "2026-10-02",
  }))
    await userEvent.type(form.getByLabelText(label), value);
  await userEvent.click(form.getByRole("button", { name: "Consulter" }));
  expect(await screen.findByText("feezit-events")).toBeInTheDocument();
  const table = within(screen.getByRole("table"));
  expect(
    table.getByRole("columnheader", { name: "Visites profil" }),
  ).toBeInTheDocument();
  expect(
    table.getByRole("columnheader", { name: "Sorties promotionnelles" }),
  ).toBeInTheDocument();
  expect(table.getByText("12")).toBeInTheDocument();
  expect(table.queryByText("777")).not.toBeInTheDocument();
  expect(screen.queryByText("666")).not.toBeInTheDocument();
  expect(screen.getByText(/pas des visiteurs uniques/i)).toBeInTheDocument();
  expect(
    http.mock.calls.some(([url]) =>
      url.endsWith(`accounts/${owner}/stats?from=2026-10-01&to=2026-10-02`),
    ),
  ).toBe(true);
});
it("refuse une période inversée avant HTTP et efface un résultat ancien si la nouvelle lecture échoue", async () => {
  window.location.hash = `#/stats?ownerId=${owner}`;
  const late = deferred();
  const http = httpBoundary((url) => {
    if (!url.includes("/stats?")) return;
    if (url.includes("from=2026-10-01")) return late.promise;
    return response(504);
  });
  render(<App client={createOfficeClient(http)} />);
  const form = within(
    await screen.findByRole("form", { name: "Consulter les statistiques" }),
  );
  await userEvent.type(form.getByLabelText("Du (UTC)"), "2026-10-03");
  await userEvent.type(form.getByLabelText("Au (UTC)"), "2026-10-02");
  await userEvent.click(form.getByRole("button", { name: "Consulter" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("période");
  expect(http.mock.calls.some(([url]) => url.includes("/stats?"))).toBe(false);
  await userEvent.clear(form.getByLabelText("Du (UTC)"));
  await userEvent.type(form.getByLabelText("Du (UTC)"), "2026-10-01");
  await userEvent.click(form.getByRole("button", { name: "Consulter" }));
  await userEvent.clear(form.getByLabelText("Du (UTC)"));
  await userEvent.type(form.getByLabelText("Du (UTC)"), "2026-10-02");
  await userEvent.click(form.getByRole("button", { name: "Consulter" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "pas répondu à temps",
  );
  await act(async () =>
    late.resolve(
      response(200, {
        source: "DONNÉE OBSOLÈTE",
        daily: [{ profile_view: 777 }],
      }),
    ),
  );
  expect(screen.queryByText("DONNÉE OBSOLÈTE")).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
