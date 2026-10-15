import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Table } from "../src/components.jsx";

it.each([
  "__proto__",
  "constructor",
  "draft",
  "2026-10-12",
  "2026-10-12T12:00:00Z",
])(
  "affiche le contenu d’article %s littéralement sans casser les statuts et dates",
  (content) => {
    render(
      <Table
        items={[
          {
            articleDescription: content,
            articleImage: content,
            publicationStatus: "draft",
            openedAt: "2026-10-12",
          },
        ]}
        columns={[
          ["articleDescription", "Description"],
          ["articleImage", "Image"],
          ["publicationStatus", "Statut", "status"],
          ["openedAt", "Date", "date"],
        ]}
      />,
    );
    const cells = screen.getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual([
      content,
      content,
      "Brouillon",
      "12/10/2026",
    ]);
  },
);

it.each(["__proto__", "constructor"])(
  "affiche le statut inconnu %s comme texte sans lookup hérité",
  (status) => {
    render(
      <Table items={[{ status }]} columns={[["status", "Statut", "status"]]} />,
    );
    expect(screen.getByRole("cell")).toHaveTextContent(status);
  },
);

it("conserve le tiret pour le contenu absent", () => {
  render(
    <Table
      items={[{ articleDescription: "", articleImage: null }]}
      columns={[
        ["articleDescription", "Description"],
        ["articleImage", "Image"],
      ]}
    />,
  );
  expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
    "—",
    "—",
  ]);
});
