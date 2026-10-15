import { Confirmation } from "./components.jsx";
import { safeImageUrl as isSafeHttpUrl } from "./PromoImage.jsx";
import { usePromoEditor } from "./usePromoEditor.js";
const keys = ["destinationUrl"];
const fields = [
  { key: "promoId", label: "Offre UUID" },
  { key: "destinationUrl", label: "Destination" },
];
export function PromoDestinationEditor({
  client,
  promoId,
  revision,
  refresh,
  record,
  setRecord,
  freshness,
}) {
  const editor = usePromoEditor({
    client,
    promoId,
    revision,
    refresh,
    suffix: "destination",
    keys,
    record,
    setRecord,
    readOnRevision: false,
    freshness,
    successMessage:
      "Destination enregistrée et relue. Publication, dates et procédure inchangées.",
  });
  const { values, change, pending, partial, busy, loading, error, success } =
    editor;
  return (
    <section className="detail-section" aria-label="Destination de l’offre">
      <h3>Destination de l’offre</h3>
      <p className="muted">
        Sauvegarde distincte du contenu. Ne republie pas l’offre, ne change ni
        dates, code, marque, ni procédure. Le créateur doit encore enregistrer
        son offre pour en demander la publication.
      </p>
      <form
        aria-label="Modifier la destination de l’offre"
        onSubmit={(event) => {
          event.preventDefault();
          if (partial || busy) return;
          editor.setError("");
          editor.setSuccess("");
          if (
            !isSafeHttpUrl(values.destinationUrl) ||
            values.destinationUrl.length > 2048
          ) {
            editor.setError(
              "Destination obligatoire : URL HTTP(S) sans identifiants, 2048 caractères maximum.",
            );
            return;
          }
          editor.prepare({ ...values });
        }}
      >
        <fieldset disabled={busy || loading}>
          <label>
            Destination (URL HTTP/S)
            <input
              name="destinationUrl"
              type="url"
              pattern="https?://.+"
              required
              maxLength={2048}
              value={values.destinationUrl}
              onChange={(event) => change("destinationUrl", event.target.value)}
            />
          </label>
          <button className="primary" disabled={partial}>
            {busy ? "En cours…" : "Enregistrer la destination"}
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
      {pending && (
        <Confirmation
          title="Enregistrer la destination"
          consequence="Cette modification ne republie pas l’offre, ne change ni dates, ni procédure, ni code ou marque. La sauvegarde de description/image est indépendante."
          fields={fields}
          values={{ promoId, ...pending }}
          onCancel={() => editor.setPending(null)}
          onConfirm={() => editor.save(pending)}
        />
      )}
    </section>
  );
}
