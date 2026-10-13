import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App.jsx";
import { createOfficeClient } from "../src/api.js";
const response = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});
describe("Accès opérateur", () => {
  it("refuse les identifiants sans ouvrir les données privées et encode le formulaire avec CSRF", async () => {
    const calls = [];
    const transport = vi.fn(async (url, options) => {
      calls.push([url, options]);
      if (url.endsWith("/csrf"))
        return response(200, {
          token: "csrf-test",
          headerName: "X-CSRF-TOKEN",
        });
      return response(401, { code: "UNAUTHORIZED" });
    });
    render(<App client={createOfficeClient(transport)} />);
    await userEvent.type(
      await screen.findByLabelText("Identifiant Office"),
      "francois-test",
    );
    await userEvent.type(
      screen.getByLabelText("Mot de passe"),
      "synthetic&password",
    );
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Identifiants refusés",
    );
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    const login = calls.find(([url]) => url.endsWith("/auth/login"))[1];
    expect(login.headers["X-CSRF-TOKEN"]).toBe("csrf-test");
    expect(new URLSearchParams(login.body).get("password")).toBe(
      "synthetic&password",
    );
    expect(login.credentials).toBe("same-origin");
    expect(localStorage.length).toBe(0);
  });
});
