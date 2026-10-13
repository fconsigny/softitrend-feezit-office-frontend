import { useState } from "react";
import { CommandForm, ResourceList, uuidPattern } from "./components.jsx";
import { commands } from "./commands.js";
import { Stats } from "./Stats.jsx";
import { PromoContentEditor } from "./PromoContentEditor.jsx";
export const accountColumns = [
  ["id", "Compte UUID"],
  ["username", "Pseudo"],
  ["name", "Nom"],
  ["visibility", "Profil"],
  ["banned", "Banni"],
];
export const promoColumns = [
  ["id", "Offre UUID"],
  ["store", "Marque"],
  ["code", "Code"],
  ["articleName", "Article"],
  ["articleDescription", "Description"],
  ["articleImage", "Image (URL)"],
  ["ownerUsername", "Créateur"],
  ["publicationStatus", "Publication"],
  ["status", "Validité"],
  ["endDate", "Fin"],
];
export const incidentColumns = [
  ["promoId", "Offre UUID"],
  ["ownerId", "Compte UUID"],
  ["kind", "Procédure"],
  ["openedAt", "Ouverture"],
  ["firstSentAt", "Premier envoi attesté"],
];
function Waitlist({ client, revision, refresh }) {
  const [store, setStore] = useState("");
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
            setStore(new FormData(event.currentTarget).get("store"));
          }}
        >
          <label>
            Marque à consulter
            <input name="store" required autoComplete="off" />
          </label>
          <button>Consulter</button>
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
              ["receivedAt", "Réception email"],
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
      />
      <CommandForm
        client={client}
        command={commands.response}
        onSuccess={refresh}
      />
    </>
  );
}
function Moderation({ client, revision, refresh, initial }) {
  const [owner, setOwner] = useState("");
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
  ["deliveryStatus", "Émission"],
  ["createdAt", "Mise en attente"],
  ["sentAt", "Émission attestée le"],
  ["deliveryReference", "Référence"],
];
function Notifications({ client, revision, refresh }) {
  return (
    <>
      <p className="notice">
        Pending n’est pas envoyé. L’outbox représente les notifications à
        traiter ; le suivi du transport ci-dessous est une lecture distincte.
        Une attestation opérateur ne prouve pas la réception.
      </p>
      <ResourceList
        client={client}
        revision={revision}
        title="Outbox · notifications"
        path="outbox"
        columns={outboxColumns}
      />
      <section className="panel" aria-label="Limite de confirmation">
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
        columns={[
          ["id", "ID"],
          ["kind", "Type"],
          ["status", "Transport"],
          ["claimedAt", "Prise en charge"],
          ["sentAt", "Émission transport"],
          ["smtpReference", "Référence SMTP"],
          ["failureCode", "Code échec"],
          ["requestId", "Requête"],
        ]}
      />
      <CommandForm
        client={client}
        command={commands.jobs}
        onSuccess={refresh}
      />
    </>
  );
}
export function Page({ route, hash = "", client, revision, refresh }) {
  const initial = Object.fromEntries(
    new URLSearchParams(hash.split("?")[1] || ""),
  );
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
    return <Waitlist client={client} revision={revision} refresh={refresh} />;
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
        action={(item) => (
          <a href={`#/moderation?ownerId=${encodeURIComponent(item.id)}`}>
            Examiner
          </a>
        )}
      />
    );
  if (route === "offres")
    return (
      <>
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
        <CommandForm
          client={client}
          command={commands.reservation}
          onSuccess={refresh}
          open
        />
      </>
    );
  return (
    <>
      <p className="subtitle">
        Les opérations à examiner, directement depuis Feezit. Aucun KPI global
        extrapolé, aucun classement inventé.
      </p>
      <div className="cards">
        <a className="card" href="#/offres" aria-label="Préparer un accord">
          <strong>01 · Préparer un accord</strong>
          <p>
            Documents versionnés, accord reçu puis réservation en brouillon.
          </p>
        </a>
        <a
          className="card"
          href="#/moderation"
          aria-label="Examiner une procédure"
        >
          <strong>02 · Examiner une procédure</strong>
          <p>Signalements, modération et décisions de participation.</p>
        </a>
        <a
          className="card"
          href="#/notifications"
          aria-label="Traiter les notifications"
        >
          <strong>03 · Traiter les notifications</strong>
          <p>Émission réelle, attestations et suivi des échéances.</p>
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
        title="Notifications · états réels"
        path="outbox"
        columns={outboxColumns.filter(([key]) =>
          ["id", "kind", "deliveryStatus", "createdAt", "sentAt"].includes(key),
        )}
      />
      <p className="notice">
        Les listes paginées ne sont pas des indicateurs globaux d’activité. La
        mise en attente ne prouve jamais une émission email.
      </p>
    </>
  );
}
