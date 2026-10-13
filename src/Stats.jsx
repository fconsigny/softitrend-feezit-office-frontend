import { useState } from "react";
import { Table, uuidPattern, displayValue } from "./components.jsx";
import { useResource } from "./useResource.js";
export function Stats({ client, revision, initial }) {
  const [path, setPath] = useState(null);
  const [validation, setValidation] = useState("");
  const resource = useResource(client, path, revision);
  function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const from = values.from;
    const to = values.to;
    const day = 86400000;
    if (
      from &&
      to &&
      (from > to || (new Date(to) - new Date(from)) / day >= 366)
    ) {
      setValidation(
        "La période doit être chronologique et limitée à 366 jours inclusifs.",
      );
      setPath(null);
      return;
    }
    setValidation("");
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    setPath(`accounts/${encodeURIComponent(values.ownerId)}/stats?${query}`);
  }
  return (
    <>
      <p className="notice">
        Événements bruts, pas des visiteurs uniques. Aucune vente, commission,
        conversion ou revenu déduit. Seules les visites profil et sorties
        promotionnelles sont présentées.
      </p>
      <section className="panel">
        <form
          className="lookup"
          aria-label="Consulter les statistiques"
          onSubmit={submit}
        >
          <div className="form-grid">
            <label>
              Compte propriétaire (UUID)
              <input
                name="ownerId"
                pattern={uuidPattern}
                required
                defaultValue={initial.ownerId || ""}
              />
            </label>
            <label>
              Du (UTC)
              <input
                name="from"
                type="date"
                min="0001-01-01"
                max="9999-12-31"
              />
            </label>
            <label>
              Au (UTC)
              <input name="to" type="date" min="0001-01-01" max="9999-12-31" />
            </label>
          </div>
          <p className="muted">
            Dates facultatives : défaut serveur, 7 derniers jours UTC. Maximum
            366 jours inclusifs.
          </p>
          <button className="primary">Consulter</button>
          {validation && <p role="alert">{validation}</p>}
        </form>
      </section>
      {resource.loading && <p role="status">Chargement des statistiques…</p>}
      {resource.error && <p role="alert">{resource.error}</p>}
      {resource.data && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Mesures quotidiennes</h2>
            <span className="badge">
              {displayValue(resource.data.from)} —{" "}
              {displayValue(resource.data.to)}
            </span>
          </div>
          <div className="metrics">
            <div>
              <strong>
                {displayValue(resource.data.totals?.profile_view)}
              </strong>
              <p>Visites profil · période</p>
            </div>
            <div>
              <strong>
                {displayValue(resource.data.totals?.promo_outbound)}
              </strong>
              <p>Sorties promotionnelles · période</p>
            </div>
          </div>
          <Table
            items={resource.data.daily ?? []}
            columns={[
              ["date", "Jour UTC"],
              ["profile_view", "Visites profil"],
              ["promo_outbound", "Sorties promotionnelles"],
            ]}
          />
          <p className="state muted">
            Source : <span>{resource.data.source}</span> ·{" "}
            {resource.data.measurement === "raw-events-not-unique-visitors"
              ? "Événements bruts, sans déduplication des visiteurs."
              : "Méthode non renseignée."}
          </p>
        </section>
      )}
      {!path && !validation && (
        <p className="muted">
          Sélectionnez un compte et une période pour consulter les mesures
          privées réelles.
        </p>
      )}
    </>
  );
}
