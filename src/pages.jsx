import { useState } from "react";
import { useResource } from "./useResource.js";
import {
  CommandForm,
  ResourceList,
  uuidPattern,
  displayValue,
} from "./components.jsx";
import { commands } from "./commands.js";
import { Stats } from "./Stats.jsx";
import { PromoContentEditor } from "./PromoContentEditor.jsx";
export const accountColumns = [
  ["id", "Compte UUID"],
  ["username", "Pseudo"],
  ["name", "Nom"],
  ["visibility", "Profil", "status"],
  ["banned", "Banni", "boolean"],
];
export const promoColumns = [
  ["id", "Offre UUID"],
  ["store", "Marque"],
  ["code", "Code"],
  ["articleName", "Article"],
  ["articleDescription", "Description"],
  ["articleImage", "Image (URL)"],
  ["ownerUsername", "Créateur"],
  ["publicationStatus", "Publication", "status"],
  ["status", "Validité", "status"],
  ["endDate", "Fin", "date"],
];
export const incidentColumns = [
  ["promoId", "Offre UUID"],
  ["ownerId", "Compte UUID"],
  ["kind", "Procédure"],
  ["openedAt", "Ouverture", "date"],
  ["firstSentAt", "Premier envoi attesté", "date"],
];
function ServerTotal({ client, revision, path, title, description }) {
  const resource = useResource(client, `${path}?page=0&size=1`, revision);
  const total = resource.data?.total;
  const available = !resource.error && Number.isInteger(total) && total >= 0;
  return (
    <section className="card total-card" aria-label={title}>
      <h2>{title}</h2>
      <strong className="total-value">
        {resource.loading ? "Chargement…" : available ? total : "Indisponible"}
      </strong>
      <p>{description}</p>
      {resource.error && <p role="alert">{resource.error}</p>}
    </section>
  );
}
function AccountActions({ ownerId }) {
  if (!new RegExp(`^${uuidPattern}$`).test(ownerId || "")) return null;
  const query = `ownerId=${encodeURIComponent(ownerId)}`;
  return (
    <div className="account-actions">
      <a href={`#/offres?${query}`}>Réserver une offre</a>
      <a href={`#/stats?${query}`}>Statistiques du compte</a>
      <a href={`#/moderation?${query}`}>Examiner le dossier</a>
      <a href={`#/attente?${query}`}>Ajouter à l’attente</a>
    </div>
  );
}
function Waitlist({ client, revision, refresh, initial }) {
  const [store, setStore] = useState("");
  const [validation, setValidation] = useState("");
  return (
    <>
      <p className="notice">
        Aucune priorité d’ancienneté. Les réponses suivent la réception email,
        sans attribution automatique ni transfert de statistiques.
      </p>
      <section className="panel">
        <form
          className="search"
          aria-label="Consulter l’attente"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("store");
            if (value.length > 100) {
              setValidation(
                "Marque : 100 caractères maximum. Saisie conservée, non tronquée.",
              );
              return;
            }
            setValidation("");
            setStore(value);
          }}
        >
          <label>
            Marque à consulter
            <input
              name="store"
              maxLength={100}
              title="100 caractères maximum"
              required
              autoComplete="off"
            />
          </label>
          <button>Consulter</button>
          {validation && <p role="alert">{validation}</p>}
        </form>
      </section>
      {store ? (
        <>
          <ResourceList
            key={`w-${store}`}
            client={client}
            revision={revision}
            title="Personnes en attente"
            path={`waitlist?store=${encodeURIComponent(store)}`}
            columns={[
              ["ownerId", "Compte UUID"],
              ["creatorName", "Créateur"],
              ["code", "Code"],
            ]}
          />
          <ResourceList
            key={`r-${store}`}
            client={client}
            revision={revision}
            title="Réponses favorables · ordre de réception"
            path={`waitlist/responses?store=${encodeURIComponent(store)}`}
            columns={[
              ["ownerId", "Compte UUID"],
              ["receivedAt", "Réception email", "date"],
              ["emailReference", "Référence email"],
            ]}
          />
        </>
      ) : (
        <p className="muted">
          Choisissez une marque pour consulter ses attentes et réponses.
        </p>
      )}
      <CommandForm
        client={client}
        command={commands.waitlist}
        onSuccess={refresh}
        initial={initial}
        open={Boolean(initial.ownerId)}
      />
      <CommandForm
        client={client}
        command={commands.response}
        onSuccess={refresh}
        initial={initial}
      />
    </>
  );
}
function Moderation({ client, revision, refresh, initial }) {
  const [owner, setOwner] = useState(initial.ownerId || "");
  return (
    <>
      <p className="notice">
        Signalement, fraude établie, masquage et bannissement : des décisions
        différentes. Type et date d’ouverture peuvent ne pas être fournis par
        Feezit : aucun délai n’est inventé. Dossiers et preuves externes restent
        sous responsabilité opérateur.
      </p>
      <ResourceList
        client={client}
        revision={revision}
        title="Signalements et procédures"
        path="incidents"
        serverPage
        searchable={false}
        columns={incidentColumns}
        action={(item) => (
          <a
            href={`#/moderation?promoId=${encodeURIComponent(item.promoId || "")}&ownerId=${encodeURIComponent(item.ownerId || "")}`}
          >
            Examiner
          </a>
        )}
      />
      <section className="panel">
        <form
          className="search"
          aria-label="Consulter un dossier"
          onSubmit={(event) => {
            event.preventDefault();
            setOwner(new FormData(event.currentTarget).get("ownerId"));
          }}
        >
          <label>
            Compte à consulter (UUID)
            <input
              name="ownerId"
              pattern={uuidPattern}
              defaultValue={initial.ownerId || ""}
              required
            />
          </label>
          <button>Consulter le dossier</button>
        </form>
      </section>
      {owner && (
        <ResourceList
          key={owner}
          client={client}
          revision={revision}
          title="Dossier interne"
          path={`accounts/${encodeURIComponent(owner)}/moderation`}
          searchable={false}
          columns={[
            ["phase", "Phase"],
            ["reason", "Motif"],
            ["facts", "Faits"],
            ["exchanges", "Échanges"],
            ["dossierReference", "Référence dossier"],
          ]}
        />
      )}
      <h2 className="section-label">Offre et procédure</h2>
      {["report", "resolve", "fraud"].map((key) => (
        <CommandForm
          key={key}
          client={client}
          command={commands[key]}
          onSuccess={refresh}
          initial={initial}
        />
      ))}
      <h2 className="section-label">Compte et participation</h2>
      {["mask", "unmask", "ban", "unban", "profile"].map((key) => (
        <CommandForm
          key={key}
          client={client}
          command={commands[key]}
          onSuccess={refresh}
          initial={initial}
        />
      ))}
    </>
  );
}
export const outboxColumns = [
  ["id", "Notification UUID"],
  ["ownerId", "Compte UUID"],
  ["resourceId", "Ressource UUID"],
  ["kind", "Type"],
  ["recipient", "Destinataire"],
  ["deliveryStatus", "Émission", "status"],
  ["createdAt", "Mise en attente", "date"],
  ["sentAt", "Émission attestée le", "date"],
  ["deliveryReference", "Référence"],
];
function OperationsStatus({ client, revision }) {
  const resource = useResource(client, "operations-status", revision);
  const data = resource.data;
  return (
    <section
      className="panel editor-panel"
      aria-label="Configuration opérationnelle"
    >
      <h2>Configuration opérationnelle</h2>
      {resource.loading ? (
        <p role="status">Chargement de la configuration…</p>
      ) : resource.error ? (
        <p role="alert">{resource.error}</p>
      ) : (
        <dl className="record-details">
          <div>
            <dt>Transport email</dt>
            <dd>
              {data?.emailTransportEnabled === true
                ? "Activé"
                : data?.emailTransportEnabled === false
                  ? "Désactivé"
                  : "Indisponible"}
            </dd>
          </div>
          <div>
            <dt>Échéances planifiées</dt>
            <dd>
              {data?.participationJobsEnabled === true
                ? "Activées"
                : data?.participationJobsEnabled === false
                  ? "Désactivées"
                  : "Indisponibles"}
            </dd>
          </div>
          <div>
            <dt>Configuration observée le (serveur)</dt>
            <dd>{displayValue(data?.observedAt, { format: "date" })}</dd>
          </div>
        </dl>
      )}
      <p className="muted">
        Configuration effective seulement : ni test du fournisseur, ni preuve
        d’envoi ou de réception, ni date du dernier job.
      </p>
    </section>
  );
}
function Notifications({ client, revision, refresh }) {
  return (
    <>
      <p className="notice">
        Pending n’est pas envoyé. L’outbox représente les notifications à
        traiter ; le suivi du transport ci-dessous est une lecture distincte.
        Une attestation opérateur ne prouve pas la réception.
      </p>
      <OperationsStatus client={client} revision={revision} />
      <ResourceList
        client={client}
        revision={revision}
        title="Outbox · notifications"
        path="outbox-page"
        serverPage
        searchable={false}
        scope="Tous les états enregistrés. Total fourni par le serveur ; aucune émission ou réception déduite de la présence en outbox."
        columns={outboxColumns}
      />
      <section
        className="panel editor-panel"
        aria-label="Limite de confirmation"
      >
        <h2>Confirmation manuelle indisponible</h2>
        <p>
          Le backend Feezit actuel refuse la confirmation manuelle d’envoi, même
          lorsque le transport automatique est désactivé. Office ne contourne
          pas cette protection. Le suivi ci-dessous restitue les états
          enregistrés par Feezit ; une notification en attente reste en attente
          tant qu’une émission n’est pas réellement confirmée par son transport.
        </p>
      </section>
      <ResourceList
        client={client}
        revision={revision}
        title="Suivi du transport email"
        path="email-deliveries"
        scope="100 dernières notifications au maximum. Filtre et pagination locaux dans ce périmètre, pas de total historique. Une absence ici ne prouve pas l’absence d’une émission plus ancienne."
        columns={[
          ["id", "ID"],
          ["kind", "Type"],
          ["status", "Transport", "status"],
          ["claimedAt", "Prise en charge", "date"],
          ["sentAt", "Émission transport", "date"],
          ["smtpReference", "Référence SMTP"],
          ["failureCode", "Code échec"],
          ["requestId", "Requête"],
        ]}
      />
      <section className="danger-zone" aria-label="Opérations à effets réels">
        <h2>Opérations à effets réels</h2>
        <p>
          Réservé à un environnement et un périmètre autorisés. Aucun lancement
          automatique dans Office, aucune simulation d’impact.
        </p>
        <CommandForm
          client={client}
          command={commands.jobs}
          onSuccess={refresh}
        />
      </section>
    </>
  );
}
export function Page({ route, hash = "", client, revision, refresh }) {
  const params = new URLSearchParams(hash.split("?")[1] || "");
  const initial = {};
  for (const key of ["ownerId", "promoId"]) {
    const values = params.getAll(key);
    if (values.length === 1 && new RegExp(`^${uuidPattern}$`).test(values[0]))
      initial[key] = values[0];
  }
  if (route === "stats")
    return <Stats client={client} revision={revision} initial={initial} />;
  if (route === "notifications")
    return (
      <Notifications
        client={client}
        revision={revision}
        refresh={refresh}
        initial={initial}
      />
    );
  if (route === "moderation")
    return (
      <Moderation
        client={client}
        revision={revision}
        refresh={refresh}
        initial={initial}
      />
    );
  if (route === "attente")
    return (
      <Waitlist
        client={client}
        revision={revision}
        refresh={refresh}
        initial={initial}
      />
    );
  if (route === "marques")
    return (
      <>
        <ResourceList
          client={client}
          revision={revision}
          title="Référentiel et alias"
          path="brands"
          columns={[
            ["brandKey", "Clé canonique"],
            ["displayName", "Marque"],
            ["aliasKey", "Alias"],
          ]}
        />
        <CommandForm
          client={client}
          command={commands.alias}
          onSuccess={refresh}
          open
        />
      </>
    );
  if (route === "comptes")
    return (
      <ResourceList
        client={client}
        revision={revision}
        title="Répertoire des comptes"
        path="accounts"
        serverPage
        columns={accountColumns}
        action={(item) => <AccountActions ownerId={item.id} />}
      />
    );
  if (route === "offres")
    return (
      <>
        {initial.ownerId && (
          <section className="notice" aria-label="Compte sélectionné">
            <p>
              Compte sélectionné pour la réservation :{" "}
              <span className="mono">{initial.ownerId}</span>
            </p>
            <AccountActions ownerId={initial.ownerId} />
            <p>
              La liste des offres ci-dessous concerne tous les comptes ; aucun
              filtre propriétaire n’est disponible.
            </p>
          </section>
        )}
        <ResourceList
          client={client}
          revision={revision}
          title="Offres et brouillons"
          path="promos"
          serverPage
          columns={promoColumns}
          action={(item) => (
            <>
              <a href={`#/offres?promoId=${encodeURIComponent(item.id)}`}>
                Modifier le contenu
              </a>
              {" · "}
              <a
                href={`#/moderation?promoId=${encodeURIComponent(item.id)}&ownerId=${encodeURIComponent(item.ownerId || "")}`}
              >
                Examiner
              </a>
            </>
          )}
        />
        {new RegExp(`^${uuidPattern}$`).test(initial.promoId || "") && (
          <PromoContentEditor
            key={initial.promoId}
            client={client}
            promoId={initial.promoId}
            revision={revision}
            refresh={refresh}
          />
        )}
        <ResourceList
          client={client}
          revision={revision}
          title="Trouver le compte à réserver"
          path="accounts"
          serverPage
          columns={accountColumns}
          action={(item) =>
            new RegExp(`^${uuidPattern}$`).test(item.id || "") && (
              <a href={`#/offres?ownerId=${encodeURIComponent(item.id)}`}>
                Choisir ce compte
              </a>
            )
          }
        />
        <CommandForm
          client={client}
          command={commands.reservation}
          onSuccess={refresh}
          initial={initial}
          open
        />
      </>
    );
  return (
    <>
      <p className="subtitle">
        Les opérations à examiner, directement depuis Feezit. Totaux fournis par
        le serveur, aucun KPI global extrapolé, aucun classement inventé.
      </p>
      <div className="cards">
        <ServerTotal
          client={client}
          revision={revision}
          path="accounts"
          title="Comptes · tous états"
          description="Publics, masqués, sans profil et bannis inclus."
        />
        <ServerTotal
          client={client}
          revision={revision}
          path="promos"
          title="Offres · tous états"
          description="Brouillons, publiées et masquées incluses. Toutes validités."
        />
        <ServerTotal
          client={client}
          revision={revision}
          path="incidents"
          title="Procédures ouvertes · total"
          description="Procédures encore présentes, pas un historique des décisions."
        />
      </div>
      <h2 className="section-label">Votre prochain geste</h2>
      <div className="cards">
        <a className="card" href="#/comptes" aria-label="Retrouver un créateur">
          <strong>01 · Retrouver un créateur</strong>
          <p>Répertoire interne, dossier et statistiques du bon compte.</p>
        </a>
        <a className="card" href="#/offres" aria-label="Préparer une offre">
          <strong>02 · Préparer une offre</strong>
          <p>Accord reçu, réservation en brouillon et contenu de l’offre.</p>
        </a>
        <a
          className="card"
          href="#/moderation"
          aria-label="Traiter les procédures"
        >
          <strong>03 · Traiter les procédures</strong>
          <p>Signalements, dossiers et décisions de participation.</p>
        </a>
      </div>
      <ResourceList
        client={client}
        revision={revision}
        title="Procédures ouvertes"
        path="incidents"
        serverPage
        searchable={false}
        columns={incidentColumns.filter(([key]) => key !== "ownerId")}
        action={(item) => (
          <a
            href={`#/moderation?promoId=${encodeURIComponent(item.promoId || "")}&ownerId=${encodeURIComponent(item.ownerId || "")}`}
          >
            Examiner
          </a>
        )}
      />
      <ResourceList
        client={client}
        revision={revision}
        title="Notifications · tous états"
        path="outbox-page"
        serverPage
        searchable={false}
        columns={outboxColumns.filter(([key]) =>
          ["id", "kind", "deliveryStatus", "createdAt", "sentAt"].includes(key),
        )}
      />
      <p className="notice">
        Notifications : tous les états, pas seulement les éléments à traiter.
        Les totaux de répertoire ne sont pas des indicateurs de vente ou
        d’activité. La mise en attente ne prouve jamais une émission email.
      </p>
    </>
  );
}
