import { useEffect, useRef, useState } from "react";
import { Confirmation, displayValue } from "./components.jsx";
import { isAborted } from "./api.js";
import { PromoImage } from "./PromoImage.jsx";
const fields = [
  { key: "articleDescription", label: "Description de l’article" },
  { key: "articleImage", label: "Image de l’article (URL)" },
];
const contentOf = (promo) => ({
  articleDescription: promo.articleDescription ?? "",
  articleImage: promo.articleImage ?? "",
});
export function PromoContentEditor({ client, promoId, revision, refresh }) {
  const [record, setRecord] = useState(null);
  const [values, setValues] = useState({
    articleDescription: "",
    articleImage: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(null);
  const dirty = useRef(false);
  const mutation = useRef();
  const path = `promos/${encodeURIComponent(promoId)}`;
  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    client.management(path, { signal: controller.signal }).then(
      (data) => {
        if (controller.signal.aborted) return;
        setRecord(data);
        if (!dirty.current) setValues(contentOf(data));
        setLoading(false);
      },
      (failure) => {
        if (!controller.signal.aborted && !isAborted(failure)) {
          setError(failure.message);
          setLoading(false);
        }
      },
    );
    return () => controller.abort();
  }, [client, path, revision]);
  async function save(content) {
    setPending(null);
    setBusy(true);
    setSuccess("");
    setError("");
    const controller = new AbortController();
    mutation.current = controller;
    try {
      await client.management(`${path}/content`, {
        method: "PUT",
        data: content,
        signal: controller.signal,
      });
      const updated = await client.management(path, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setRecord(updated);
      setValues(contentOf(updated));
      dirty.current = false;
      refresh();
      setSuccess(
        "Contenu enregistré et relu. Publication et modération inchangées.",
      );
    } catch (failure) {
      if (!controller.signal.aborted && !isAborted(failure))
        setError(failure.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Contenu de l’offre">
      <h2>Contenu de l’offre</h2>
      <p className="notice">
        Cette modification ne publie pas l’offre et ne lève aucune modération.
        Code, marque et dates restent inchangés.
      </p>
      {record && (
        <>
          <p>
            Offre {record.id} · {record.store} · {record.code} ·{" "}
            {displayValue(record.publicationStatus)}
          </p>
          <p className="promo-description">
            {record.articleDescription || "Aucune description."}
          </p>
          <p className="promo-image-url">
            {record.articleImage || "Aucune image."}
          </p>
          <PromoImage url={record.articleImage} />
        </>
      )}
      {loading && <p role="status">Chargement du contenu…</p>}
      {record && (
        <form
          aria-label="Modifier le contenu de l’offre"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            setSuccess("");
            setPending({ ...values });
          }}
        >
          <fieldset disabled={busy || loading}>
            <div className="form-grid">
              <label>
                Description de l’article
                <textarea
                  name="articleDescription"
                  maxLength={2000}
                  value={values.articleDescription}
                  onChange={(event) => {
                    dirty.current = true;
                    setSuccess("");
                    setValues({
                      ...values,
                      articleDescription: event.target.value,
                    });
                  }}
                />
              </label>
              <label>
                Image de l’article (URL)
                <input
                  name="articleImage"
                  type="url"
                  pattern="https?://.+"
                  maxLength={2048}
                  value={values.articleImage}
                  onChange={(event) => {
                    dirty.current = true;
                    setSuccess("");
                    setValues({ ...values, articleImage: event.target.value });
                  }}
                />
              </label>
            </div>
            <p className="muted">
              Champs facultatifs. Laisser vide efface la description ou l’image.
            </p>
            <button className="primary">
              {busy ? "En cours…" : "Enregistrer le contenu"}
            </button>
          </fieldset>
          {error && <p role="alert">{error}</p>}
          {success && (
            <p role="status" className="success">
              {success}
            </p>
          )}
        </form>
      )}
      {!record && error && <p role="alert">{error}</p>}
      {pending && (
        <Confirmation
          title="Enregistrer le contenu"
          consequence="Cette opération ne publie pas l’offre et ne lève aucune modération. Les champs vides effacent le contenu correspondant."
          fields={fields}
          values={pending}
          onCancel={() => setPending(null)}
          onConfirm={() => save(pending)}
        />
      )}
    </section>
  );
}
