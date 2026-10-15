import { useRef, useState } from "react";
import { Confirmation, displayValue } from "./components.jsx";
import { PromoBannerEditor } from "./PromoBannerEditor.jsx";
import { PromoDetails, PromoParticipation } from "./PromoDetails.jsx";
import { PromoDestinationEditor } from "./PromoDestinationEditor.jsx";
import { usePromoEditor } from "./usePromoEditor.js";
const fields = [
  { key: "articleDescription", label: "Description de l’article" },
];
const keys = fields.map((field) => field.key);
export function PromoContentEditor({ client, promoId, revision, refresh }) {
  // One confirmed DTO per mounted offer; drafts/verification remain per form.
  const [record, setRecord] = useState(null);
  const freshness = useRef(0);
  const editor = usePromoEditor({
    client,
    promoId,
    revision,
    refresh,
    record,
    setRecord,
    freshness,
    suffix: "description",
    keys,
    successMessage:
      "Contenu enregistré et relu. Publication et modération inchangées.",
  });
  const { values, change, error, success, busy, loading, pending, partial } =
    editor;
  return (
    <section className="panel editor-panel" aria-label="Contenu de l’offre">
      <h2>Contenu de l’offre</h2>
      <p className="notice">
        Cette modification ne publie pas l’offre et ne lève aucune modération.
        Code, marque et dates restent inchangés.
      </p>
      {record && (
        <>
          <p className="promo-identity">
            Offre {record.id} · {record.store} · {record.code} ·{" "}
            {displayValue(record.publicationStatus, { format: "status" })}
          </p>
          <p className="promo-description">
            {record.articleDescription || "Aucune description."}
          </p>
          <p className="promo-image-url">
            {record.articleImage || "Aucune image."}
          </p>
          <PromoDetails record={record} />
          <PromoParticipation
            client={client}
            promoId={promoId}
            revision={revision}
          />
        </>
      )}
      {loading && <p role="status">Chargement du contenu…</p>}
      {record && (
        <form
          aria-label="Modifier le contenu de l’offre"
          onSubmit={(event) => {
            event.preventDefault();
            if (partial || busy) return;
            editor.setError("");
            editor.setSuccess("");
            if (values.articleDescription.length > 2000) {
              editor.setError(
                "Description : 2000 caractères maximum ; image : 2048 caractères maximum. Saisie conservée, non tronquée.",
              );
              return;
            }
            editor.prepare({ ...values });
          }}
        >
          <h3>Description</h3>
          <fieldset disabled={busy || loading}>
            <div className="form-grid">
              <label>
                Description de l’article
                <textarea
                  name="articleDescription"
                  maxLength={2000}
                  value={values.articleDescription}
                  onChange={(event) =>
                    change("articleDescription", event.target.value)
                  }
                />
              </label>
            </div>
            <p className="muted">
              Description facultative : 2000 caractères maximum. Laisser vide
              efface la description. La bannière se sauvegarde séparément.
            </p>
            <button className="primary" disabled={partial}>
              {busy ? "En cours…" : "Enregistrer le contenu"}
            </button>
          </fieldset>
          {error && <p role="alert">{error}</p>}
          {partial && (
            <button type="button" disabled={busy} onClick={editor.reread}>
              Relire
            </button>
          )}
          {success && (
            <p role="status" className="success">
              {success}
            </p>
          )}
        </form>
      )}
      {!record && error && <p role="alert">{error}</p>}
      {record && (
        <PromoBannerEditor
          client={client}
          promoId={promoId}
          revision={revision}
          refresh={refresh}
          record={record}
          setRecord={setRecord}
          freshness={freshness}
        />
      )}
      {record && (
        <PromoDestinationEditor
          client={client}
          promoId={promoId}
          revision={revision}
          refresh={refresh}
          record={record}
          setRecord={setRecord}
          freshness={freshness}
        />
      )}
      {pending && (
        <Confirmation
          title="Enregistrer le contenu"
          consequence="Cette opération ne publie pas l’offre et ne lève aucune modération. Les champs vides effacent le contenu correspondant."
          fields={[{ key: "promoId", label: "Offre UUID" }, ...fields]}
          values={{ promoId, ...pending }}
          onCancel={() => editor.setPending(null)}
          onConfirm={() => editor.save(pending)}
        />
      )}
    </section>
  );
}
