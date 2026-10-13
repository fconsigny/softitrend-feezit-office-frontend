import { vi } from "vitest";
export const owner = "11111111-1111-4111-8111-111111111111";
export const promo = "22222222-2222-4222-8222-222222222222";
export const response = (status = 200, data = null) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});
export function httpBoundary(handler = () => undefined, authenticated = true) {
  let signedIn = authenticated;
  let tokens = 0;
  return vi.fn(async (url, options = {}) => {
    const result = handler(url, options);
    if (result !== undefined) return await result;
    if (url.endsWith("/csrf"))
      return response(200, {
        token: `csrf-${++tokens}`,
        headerName: "X-CSRF-TOKEN",
      });
    if (url.endsWith("/auth/login")) {
      signedIn = true;
      return response(204);
    }
    if (url.endsWith("/auth/logout")) {
      signedIn = false;
      return response(204);
    }
    if (url.endsWith("/session"))
      return response(
        signedIn ? 200 : 401,
        signedIn ? { username: "francois-test" } : {},
      );
    if (/\/management\/(accounts|promos|incidents)\?/.test(url))
      return response(200, { items: [], total: 0, page: 0, size: 20 });
    return response(200, []);
  });
}
export function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
