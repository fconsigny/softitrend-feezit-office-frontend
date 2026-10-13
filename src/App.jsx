import { useEffect, useState, useSyncExternalStore } from "react";
import { createOfficeClient, isAborted } from "./api.js";
import { Page } from "./pages.jsx";
const defaultClient = createOfficeClient();
const navigation = [
  ["dashboard", "Tableau de bord"],
  ["comptes", "Comptes"],
  ["offres", "Offres & réservations"],
  ["marques", "Marques & alias"],
  ["attente", "Liste d’attente"],
  ["moderation", "Modération"],
  ["stats", "Statistiques"],
  ["notifications", "Notifications"],
];
function Login({ client, sessionError }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await client.login(data.get("username"), data.get("password"));
    } catch (failure) {
      if (!isAborted(failure)) setError(failure.message);
    } finally {
      form.reset();
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <form onSubmit={submit}>
        <p className="eyebrow">FEEZIT / OFFICE</p>
        <h1>Connexion opérateur</h1>
        <p>
          Accès réservé à François. Aucun compte créateur ne donne accès au
          management.
        </p>
        <label>
          Identifiant Office
          <input name="username" autoComplete="username" required />
        </label>
        <label>
          Mot de passe
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {(error || sessionError) && <p role="alert">{error || sessionError}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
const routeSnapshot = () => window.location.hash || "#/dashboard";
const routeSubscribe = (listener) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
function Office({ client, session }) {
  const hash = useSyncExternalStore(routeSubscribe, routeSnapshot);
  const [revision, setRevision] = useState(0);
  const route = hash.replace(/^#\/?/, "").split("?")[0];
  const current = navigation.find(([path]) => path === route);
  const refresh = () => setRevision((value) => value + 1);
  return (
    <div className="shell">
      <a
        className="skip"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Aller au contenu
      </a>
      <aside>
        <a className="brand" href="#/dashboard">
          Feezit <span>Office</span>
        </a>
        <nav aria-label="Navigation principale">
          {navigation.map(([path, label], index) => (
            <a
              key={path}
              href={`#/${path}`}
              aria-current={route === path ? "page" : undefined}
            >
              <span aria-hidden="true">
                {["◫", "◎", "▤", "◇", "≡", "⊙", "↗", "✉"][index]}
              </span>
              {label}
            </a>
          ))}
        </nav>
        <footer>
          <p>{session.username} · Opérateur</p>
          <button onClick={() => client.logout()}>Se déconnecter</button>
        </footer>
      </aside>
      <main id="main" tabIndex={-1}>
        <div className="topline">
          <div>
            <p className="eyebrow">ESPACE PRIVÉ / MANAGEMENT</p>
            <h1>{current?.[1] || "Page introuvable"}</h1>
          </div>
          <button onClick={refresh}>Actualiser</button>
        </div>
        {current ? (
          <Page
            key={hash}
            route={route}
            hash={hash}
            client={client}
            revision={revision}
            refresh={refresh}
          />
        ) : (
          <p>
            Cette page n’existe pas.{" "}
            <a href="#/dashboard">Revenir au tableau de bord</a>
          </p>
        )}
        <p className="muted">
          Données Feezit · dates et échéances UTC · décisions appliquées par le
          serveur
        </p>
      </main>
    </div>
  );
}
export function App({ client = defaultClient }) {
  const session = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => {
    client.initialize();
  }, [client]);
  if (session.phase === "loading")
    return (
      <main className="login">
        <p role="status">Vérification de la session…</p>
      </main>
    );
  if (session.phase !== "authenticated")
    return <Login client={client} sessionError={session.error} />;
  return <Office key={session.epoch} client={client} session={session} />;
}
