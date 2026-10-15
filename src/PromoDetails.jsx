import { displayValue } from "./components.jsx";
import { useResource } from "./useResource.js";

const details = [
  ["id", "Offre UUID"],
  ["store", "Marque"],
  ["code", "Code"],
  ["articleName", "Article"],
  ["category", "Catégorie"],
  ["ownerId", "Compte propriétaire"],
  ["ownerName", "Nom"],
  ["ownerUsername", "Pseudo"],
  ["destinationUrl", "Destination enregistrée"],
  ["conditions", "Conditions"],
  ["startDate", "Début", "date"],
  ["endDate", "Fin", "date"],
  ["createdAt", "Création de l’offre", "date"],
  ["publicationStatus", "Publication", "status"],
  ["status", "Validité temporelle", "status"],
];
const participation = [
  ["promoId", "Offre UUID"],
  ["ownerId", "Compte propriétaire"],
  ["agreementReceivedAt", "Accord reçu le", "date"],
  ["agreementReference", "Référence de l’accord"],
  ["documentVersion", "Version des documents"],
  [
    "reservationExpiresAt",
    "Échéance de réservation (accord + 7 jours)",
    "date",
  ],
];
function RecordDetails({ record, fields }) {
  return (
    <dl className="record-details">
      {fields.map(([key, label, format]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{displayValue(record[key], { format })}</dd>
        </div>
      ))}
    </dl>
  );
}
export function PromoDetails({ record }) {
  return (
    <section className="detail-section" aria-label="Détail de l’offre">
      <h3>Détail de l’offre</h3>
      <RecordDetails record={record} fields={details} />
      <p className="muted">
        Publication et validité sont distinctes : une date valide ne prouve pas
        que l’offre est publique.
      </p>
    </section>
  );
}
export function PromoParticipation({ client, promoId, revision }) {
  const resource = useResource(
    client,
    `promos/${encodeURIComponent(promoId)}/participation`,
    revision,
  );
  return (
    <section className="detail-section" aria-label="Participation enregistrée">
      <h3>Participation enregistrée</h3>
      {resource.loading ? (
        <p role="status">Chargement de l’accord…</p>
      ) : resource.error ? (
        <p role="alert">{resource.error}</p>
      ) : (
        resource.data && (
          <RecordDetails record={resource.data} fields={participation} />
        )
      )}
      <p className="muted">
        Attestation enregistrée par l’opérateur. Email original et justificatifs
        conservés hors Office ; aucun audit durable ni vérification de l’accord
        original déduit.
      </p>
    </section>
  );
}
