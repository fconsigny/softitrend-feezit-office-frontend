import { it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
import { httpBoundary, promo, response } from "./http.js";

it.each(["draft", "sent", "2026-10-12", "__proto__", "constructor"])(
  "conserve le code et la marque %s dans la vraie page offres ; seuls statut/date sont formatés",
  async (value) => {
    window.location.hash = "#/offres";
    const http = httpBoundary((url) =>
      url.includes("/promos?")
        ? response(200, {
            items: [
              {
                id: promo,
                code: value,
                store: value,
                articleName: value,
                publicationStatus: "draft",
                status: "upcoming",
                endDate: "2026-10-12",
              },
            ],
            total: 1,
          })
        : undefined,
    );
    render(<App client={createOfficeClient(http)} />);
    const list = within(
      await screen.findByRole("region", { name: "Offres et brouillons" }),
    );
    const cells = await list.findAllByRole("cell");
    expect(cells.slice(1, 4).map((cell) => cell.textContent)).toEqual([
      value,
      value,
      value,
    ]);
    expect(list.getByText("Brouillon")).toBeInTheDocument();
    expect(list.getByText("À venir")).toBeInTheDocument();
    expect(list.getByText("12/10/2026")).toBeInTheDocument();
  },
);
