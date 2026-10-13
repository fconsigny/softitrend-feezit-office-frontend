const abortError = () => new DOMException("Requête obsolète", "AbortError");
export function isAborted(error) {
  return error?.name === "AbortError";
}
export class OfficeError extends Error {
  constructor(status, code) {
    const messages = {
      400: "Données invalides. Vérifiez les champs et les dates.",
      401: "Session expirée. Reconnectez-vous.",
      403: "Action refusée. Vérifiez les droits ou renouvelez la session.",
      404: "Élément introuvable ou route indisponible.",
      409: "Conflit : cet état a changé ou cet emplacement est déjà réservé. Relisez les données.",
      429: "Trop de demandes. Réessayez dans quelques instants.",
      502: "Service Feezit indisponible. Aucune réussite n’est confirmée.",
      504: "Le service Feezit n’a pas répondu à temps. Relisez l’état avant de réessayer.",
    };
    super(
      messages[status] || "Erreur du service. Aucune réussite n’est confirmée.",
    );
    this.status = status;
    this.code = code;
  }
}
// Cookie serveur ; CSRF et données privés ne quittent jamais la mémoire.
export function createOfficeClient(transport = (...args) => fetch(...args)) {
  let csrf = null;
  let generation = 0;
  let state = { phase: "loading", username: null, error: "", epoch: 0 };
  let initialization;
  const listeners = new Set();
  const controllers = new Set();
  const publish = (next) => {
    state = { ...state, ...next, epoch: generation };
    listeners.forEach((listener) => listener());
  };
  const invalidate = (error = "") => {
    generation += 1;
    csrf = null;
    controllers.forEach((controller) => controller.abort());
    controllers.clear();
    publish({ phase: "anonymous", username: null, error });
  };
  async function request(
    path,
    {
      method = "GET",
      data,
      signal,
      form = false,
      expire = true,
      csrfHeader = true,
    } = {},
  ) {
    const epoch = generation;
    const controller = new AbortController();
    controllers.add(controller);
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    const guard = () => {
      if (epoch !== generation || controller.signal.aborted) throw abortError();
    };
    try {
      guard();
      if (method !== "GET" && csrfHeader && !csrf) await refreshCsrf();
      guard();
      const headers = { Accept: "application/json" };
      if (method !== "GET" && csrfHeader) headers[csrf.headerName] = csrf.token;
      if (data !== undefined)
        headers["Content-Type"] = form
          ? "application/x-www-form-urlencoded"
          : "application/json";
      const result = await transport(`/office-api/${path}`, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers,
        ...(data === undefined
          ? {}
          : {
              body: form
                ? new URLSearchParams(data).toString()
                : JSON.stringify(data),
            }),
      });
      guard();
      if (!result.ok) {
        let code;
        try {
          code = (await result.json())?.code;
        } catch {
          /* Never display raw upstream bodies. */
        }
        guard();
        if (result.status === 401 && expire)
          invalidate("Session expirée. Reconnectez-vous.");
        throw new OfficeError(result.status, code);
      }
      const body =
        result.status === 204 || result.status === 202
          ? null
          : await result.json();
      guard();
      return body;
    } catch (error) {
      if (
        isAborted(error) ||
        (epoch !== generation &&
          !(error instanceof OfficeError && error.status === 401))
      )
        throw abortError();
      if (error instanceof OfficeError) throw error;
      throw new Error(
        "Connexion au service impossible. Relisez l’état avant de réessayer.",
      );
    } finally {
      controllers.delete(controller);
      signal?.removeEventListener("abort", cancel);
    }
  }
  async function refreshCsrf() {
    const token = await request("csrf", { expire: false, csrfHeader: false });
    if (!token?.token || !token?.headerName)
      throw new Error("Protection de session indisponible. Réessayez.");
    csrf = token;
  }
  function initialize() {
    if (!initialization)
      initialization = (async () => {
        const epoch = generation;
        try {
          await refreshCsrf();
          const session = await request("session", { expire: false });
          if (epoch === generation)
            publish({
              phase: "authenticated",
              username: session.username,
              error: "",
            });
        } catch (error) {
          if (epoch === generation && !isAborted(error))
            publish({
              phase: "anonymous",
              error: error.status === 401 ? "" : error.message,
            });
        }
      })();
    return initialization;
  }
  async function login(username, password) {
    const previousCsrf = csrf;
    invalidate();
    csrf = previousCsrf;
    const epoch = generation;
    try {
      if (!csrf) await refreshCsrf();
      await request("auth/login", {
        method: "POST",
        data: { username, password },
        form: true,
        expire: false,
      });
      csrf = null;
      await refreshCsrf();
      const session = await request("session", { expire: false });
      if (epoch === generation)
        publish({
          phase: "authenticated",
          username: session.username,
          error: "",
        });
    } catch (error) {
      if (isAborted(error)) throw error;
      if (error.status === 401)
        throw new Error("Identifiants refusés. Vérifiez votre accès Office.");
      throw error;
    }
  }
  async function logout() {
    const previousCsrf = csrf;
    invalidate(); // Clear private views before waiting for the server.
    csrf = previousCsrf;
    const epoch = generation;
    try {
      await request("auth/logout", { method: "POST", expire: false });
      csrf = null;
      await refreshCsrf();
    } catch (error) {
      if (epoch === generation && !isAborted(error))
        publish({
          error:
            "Déconnexion serveur non confirmée. Fermez cette fenêtre et vérifiez la session.",
        });
    }
  }
  return {
    initialize,
    login,
    logout,
    request,
    management: (path, options) => request(`management/${path}`, options),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
  };
}
