import { useEffect, useRef, useState } from "react";
import { Confirmation } from "./components.jsx";
import { PromoImage, safeImageUrl } from "./PromoImage.jsx";
import { usePromoEditor } from "./usePromoEditor.js";
const keys = ["articleImage"];
const mimeTypes = ["image/png", "image/jpeg"];
const limit = 1048576;
function privateSource(image) {
  if (
    !mimeTypes.includes(image?.contentType) ||
    typeof image.base64 !== "string" ||
    image.base64.length > 1398104 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      image.base64,
    ) ||
    !image.base64
  )
    return null;
  return `data:${image.contentType};base64,${image.base64}`;
}
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () =>
      reject(
        new Error(
          "Lecture du fichier impossible. Choisissez à nouveau le fichier.",
        ),
      );
    reader.readAsDataURL(file);
  });
}
export function PromoBannerEditor({
  client,
  promoId,
  revision,
  refresh,
  record,
  setRecord,
  freshness,
}) {
  const [preview, setPreview] = useState(null);
  const [upload, setUpload] = useState(null);
  const [mode, setMode] = useState("url");
  const [reading, setReading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const fileVersion = useRef(0);
  const submittedFileVersion = useRef(0);
  const input = useRef();
  const path = `promos/${encodeURIComponent(promoId)}/banner`;
  const editor = usePromoEditor({
    client,
    promoId,
    revision,
    refresh,
    record,
    setRecord,
    freshness,
    suffix: "banner",
    keys,
    readOnRevision: false,
    readRelated: (signal) => client.management(path, { signal }),
    publishRelated: setPreview,
    successMessage:
      "Bannière enregistrée et relue. Publication et modération inchangées.",
  });
  const { values, change, busy, partial, pending, error, success } = editor;
  useEffect(
    () => () => {
      fileVersion.current++;
    },
    [],
  );
  useEffect(() => {
    if (!success || submittedFileVersion.current !== fileVersion.current)
      return;
    setUpload(null);
    setMode("url");
    if (input.current) input.current.value = "";
  }, [success]);
  useEffect(() => {
    const controller = new AbortController();
    const generation = freshness.current;
    setPreviewError("");
    client.management(path, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted && generation === freshness.current)
          setPreview(data);
      },
      () => {
        if (!controller.signal.aborted && generation === freshness.current)
          setPreviewError(
            "Aperçu privé indisponible. L’URL reste consultable.",
          );
      },
    );
    return () => controller.abort();
  }, [client, path, record.articleImage, revision, freshness]);
  async function choose(file) {
    const version = ++fileVersion.current;
    setMode("file");
    setUpload(null);
    editor.setError("");
    editor.setSuccess("");
    change("articleImage", values.articleImage);
    if (!file) {
      setReading(false);
      return;
    }
    if (!mimeTypes.includes(file.type) || file.size > limit || !file.size) {
      setReading(false);
      editor.setError(
        "Import refusé : PNG ou JPEG uniquement, 1 MiB maximum, fichier non vide.",
      );
      return;
    }
    setReading(true);
    try {
      const base64 = await readFile(file);
      if (version !== fileVersion.current) return;
      const bytes = atob(base64);
      const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
        (byte, index) => bytes.charCodeAt(index) === byte,
      );
      const jpeg =
        bytes.charCodeAt(0) === 255 &&
        bytes.charCodeAt(1) === 216 &&
        bytes.charCodeAt(2) === 255;
      if (!(file.type === "image/png" ? png : jpeg))
        throw new Error(
          "Contenu du fichier incompatible avec PNG/JPEG. Import refusé.",
        );
      setUpload({ contentType: file.type, base64, name: file.name });
    } catch (failure) {
      if (version === fileVersion.current) editor.setError(failure.message);
    } finally {
      if (version === fileVersion.current) setReading(false);
    }
  }
  function changeUrl(url) {
    fileVersion.current++;
    setMode("url");
    setReading(false);
    setUpload(null);
    if (input.current) input.current.value = "";
    change("articleImage", url);
  }
  let externalUrl = record.articleImage;
  try {
    const importedId = new URL(externalUrl).pathname.match(
      /^\/api\/promos\/([^/]+)\/banner$/,
    )?.[1];
    if (importedId?.toLowerCase() === promoId.toLowerCase())
      externalUrl = undefined;
  } catch {
    /* Invalid external URLs are rejected by PromoImage. */
  }
  const source = upload
    ? privateSource(upload)
    : preview?.url === record.articleImage
      ? privateSource(preview)
      : null;
  return (
    <section
      className="detail-section banner-editor"
      aria-label="Bannière de l’offre"
    >
      <h3>Bannière de l’offre</h3>
      <p className="muted">
        Une seule image par offre. URL HTTP(S) ou import PNG/JPEG de 1 MiB
        maximum. Sauvegarde indépendante : ne publie pas et ne lève aucune
        modération. Recadrage horizontal dans l’aperçu. Les dimensions et le
        contenu sont vérifiés et nettoyés par le serveur.
      </p>
      <PromoImage
        url={source ? undefined : externalUrl}
        privateSource={source}
      />
      {!source && !externalUrl && record.articleImage && (
        <p className="muted">
          Aperçu privé en attente ou indisponible. L’URL reste consultable.
        </p>
      )}
      {previewError && <p role="status">{previewError}</p>}
      <form
        aria-label="Modifier la bannière de l’offre"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || partial || reading) return;
          submittedFileVersion.current = fileVersion.current;
          if (mode === "file") {
            if (!upload) {
              editor.setError(
                error || "Choisissez un fichier PNG ou JPEG valide.",
              );
              return;
            }
            editor.prepare({
              contentType: upload.contentType,
              base64: upload.base64,
            });
            return;
          }
          const url = values.articleImage;
          if (url.length > 2048 || (url && !safeImageUrl(url))) {
            editor.setError(
              "Image : URL HTTP(S) sans identifiants, 2048 caractères maximum.",
            );
            return;
          }
          editor.prepare({ url });
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Image de l’article (URL)
            <input
              name="bannerUrl"
              disabled={mode === "file"}
              type="url"
              pattern="https?://.+"
              maxLength={2048}
              value={values.articleImage}
              onChange={(event) => changeUrl(event.target.value)}
            />
          </label>
          {mode === "file" && (
            <button
              type="button"
              onClick={() => changeUrl(values.articleImage)}
            >
              Utiliser une URL
            </button>
          )}
          <label>
            Importer PNG/JPEG (1 MiB maximum)
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => choose(event.target.files?.[0])}
            />
          </label>
          {upload && (
            <p className="promo-image-url">
              Fichier sélectionné : {upload.name}. Pas encore enregistré.
            </p>
          )}
          {reading && <p role="status">Lecture du fichier…</p>}
          <button className="primary" disabled={partial || reading}>
            Enregistrer la bannière
          </button>
          <button
            type="button"
            disabled={partial || reading}
            onClick={() => {
              changeUrl("");
              submittedFileVersion.current = fileVersion.current;
              editor.prepare({ url: "" });
            }}
          >
            Effacer la bannière
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
          title="Enregistrer la bannière"
          consequence="Ne publie pas l’offre et ne lève aucune modération. Une URL vide efface la bannière."
          fields={[
            { key: "promoId", label: "Offre UUID" },
            { key: "image", label: "Bannière" },
          ]}
          values={{
            promoId,
            image:
              pending.url ??
              `Import ${pending.contentType} : ${upload?.name ?? "fichier"}`,
          }}
          onCancel={() => editor.setPending(null)}
          onConfirm={() => editor.save(pending)}
        />
      )}
    </section>
  );
}
