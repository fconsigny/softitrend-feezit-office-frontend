import { useEffect, useId, useRef, useState } from "react";
import { isAborted } from "./api.js";
import { useResource } from "./useResource.js";
import { PromoImage } from "./PromoImage.jsx";
export const uuidPattern =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
export function valueOf(record, key) {
  return (
    record?.[key] ?? record?.[key.replace(/([A-Z])/g, "_$1").toUpperCase()]
  );
}
const translations = {
  public: "Public",
  masked: "Masqué",
  absent: "Sans profil",
  draft: "Brouillon",
  published: "Publié",
  active: "Actif",
  upcoming: "À venir",
  expired: "Expiré",
  pending: "En attente d’émission",
  sent: "Émission attestée",
  sending: "En cours de transport",
  failed: "Échec",
  uncertain: "Résultat incertain",
  delivered: "Livraison confirmée",
};
export function displayValue(value, { literal = false } = {}) {
  if (value === null || value === undefined || value === "") return "—";
  if (literal) return String(value);
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (Object.hasOwn(translations, value)) return translations[value];
  if (typeof value === "object")
    return Array.isArray(value) ? value.join(", ") : "Donnée structurée";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()))
      return (
        new Intl.DateTimeFormat("fr-FR", {
          dateStyle: "short",
          ...(value.includes("T") ? { timeStyle: "short" } : {}),
          timeZone: "UTC",
        }).format(date) + (value.includes("T") ? " UTC" : "")
      );
  }
  return String(value);
}
export function Table({ items, columns, action }) {
  if (!items.length)
    return (
      <div className="empty">
        <span aria-hidden="true">◎</span>
        <p>Aucun élément pour cette sélection.</p>
      </div>
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th key={key} scope="col">
                {label}
              </th>
            ))}
            {action && <th scope="col">Ouvrir</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={valueOf(item, "id") ?? valueOf(item, "promoId") ?? index}>
              {columns.map(([key]) => (
                <td
                  key={key}
                  className={
                    key.toLowerCase().includes("id") || key === "code"
                      ? "mono"
                      : ""
                  }
                >
                  <span
                    className={
                      [
                        "visibility",
                        "publicationStatus",
                        "deliveryStatus",
                        "status",
                      ].includes(key)
                        ? "badge"
                        : ""
                    }
                  >
                    {displayValue(valueOf(item, key), {
                      literal: ["articleDescription", "articleImage"].includes(key),
                    })}
                  </span>
                </td>
              ))}
              {action && <td>{action(item)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ResourceList({
  client,
  path,
  title,
  columns,
  revision,
  serverPage = false,
  searchable = true,
  action,
}) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const id = useId();
  const size = 20;
  const endpoint = serverPage
    ? `${path}${path.includes("?") ? "&" : "?"}page=${page}&size=${size}${searchable ? `&q=${encodeURIComponent(query)}` : ""}`
    : path;
  const resource = useResource(client, endpoint, revision);
  const rows = Array.isArray(resource.data)
    ? resource.data
    : (resource.data?.items ?? []);
  const filtered = serverPage
    ? rows
    : rows.filter(
        (row) =>
          !query ||
          columns.some(([key]) =>
            String(valueOf(row, key) ?? "")
              .toLocaleLowerCase("fr")
              .includes(query.toLocaleLowerCase("fr")),
          ),
      );
  const items = serverPage
    ? filtered
    : filtered.slice(page * size, (page + 1) * size);
  const total = serverPage ? (resource.data?.total ?? 0) : filtered.length;
  return (
    <section className="panel" aria-label={title}>
      <div className="panel-heading">
        <h2>{title}</h2>
        <span className="badge">Lecture serveur</span>
      </div>
      {searchable && (
        <form
          className="search"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(0);
            setQuery(draft);
          }}
        >
          <label htmlFor={id}>Rechercher</label>
          <input
            id={id}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Nom, marque ou identifiant…"
          />
          <button>Rechercher</button>
        </form>
      )}
      {resource.loading ? (
        <p role="status" className="state">
          Chargement…
        </p>
      ) : resource.error ? (
        <p role="alert" className="state">
          {resource.error}
        </p>
      ) : (
        <>
          <Table items={items} columns={columns} action={action} />
          <div className="pagination">
            <span>
              {total} résultat{total === 1 ? "" : "s"} · page {page + 1}
            </span>
            <div>
              <button
                aria-label="Page précédente"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                ← Précédente
              </button>
              <button
                aria-label="Page suivante"
                disabled={(page + 1) * size >= total}
                onClick={() => setPage(page + 1)}
              >
                Suivante →
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
export function Confirmation({
  title,
  consequence,
  fields,
  values,
  onCancel,
  onConfirm,
}) {
  const ref = useRef();
  const [confirmed, setConfirmed] = useState(false);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector("button")?.focus();
    function keyboard(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
      if (event.key === "Tab") {
        const nodes = [
          ...ref.current.querySelectorAll("button:not(:disabled), input"),
        ];
        const first = nodes[0];
        const last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    const dialog = ref.current;
    dialog.addEventListener("keydown", keyboard);
    return () => {
      dialog.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, [onCancel]);
  return (
    <div className="overlay">
      <section
        className="dialog"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <p className="eyebrow">DÉCISION OPÉRATEUR</p>
        <h2 id={id}>{title}</h2>
        <p>{consequence}</p>
        <dl className="confirmation-values">
          {fields.map((field) => (
            <div key={field.key}>
              <dt>{field.label}</dt>
              <dd>{values[field.key] || "—"}</dd>
            </div>
          ))}
        </dl>
        <label className="check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Je confirme cette opération
        </label>
        <div className="dialog-actions">
          <button onClick={onCancel}>Annuler</button>
          <button className="primary" disabled={!confirmed} onClick={onConfirm}>
            Confirmer
          </button>
        </div>
      </section>
    </div>
  );
}
export function CommandForm({
  client,
  command,
  onSuccess,
  initial = {},
  open = false,
}) {
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [articleImage, setArticleImage] = useState(initial.articleImage || "");
  const formRef = useRef();
  const controller = useRef();
  useEffect(() => () => controller.current?.abort(), []);
  async function execute(values) {
    setPending(null);
    setBusy(true);
    setError("");
    setSuccess("");
    controller.current = new AbortController();
    try {
      const payload = { ...values };
      for (const field of command.fields) {
        if (field.type === "datetime-local" && payload[field.key])
          payload[field.key] =
            `${payload[field.key]}${payload[field.key].length === 16 ? ":00" : ""}.000Z`;
      }
      if (command.fixed) Object.assign(payload, command.fixed);
      const path = command.path(values);
      for (const field of command.pathFields ?? []) delete payload[field];
      await client.management(path, {
        method: command.method,
        signal: controller.current.signal,
        ...(command.noBody ? {} : { data: payload }),
      });
      if (!controller.current.signal.aborted) {
        setSuccess(command.success || "Opération confirmée par le serveur.");
        formRef.current?.reset();
        setArticleImage(initial.articleImage || "");
        onSuccess();
      }
    } catch (failure) {
      if (!isAborted(failure)) setError(failure.message);
    } finally {
      if (!controller.current?.signal.aborted) setBusy(false);
    }
  }
  function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError("");
    setSuccess("");
    if (command.consequence) setPending(values);
    else execute(values);
  }
  return (
    <details className="command" open={open || undefined}>
      <summary>
        {command.title}
        <span aria-hidden="true">＋</span>
      </summary>
      <form ref={formRef} onSubmit={submit} aria-label={command.title}>
        <p className="muted">{command.description}</p>
        <fieldset disabled={busy}>
          <div className="form-grid">
            {command.fields.map((field) => (
              <label key={field.key}>
                {field.label}
                {field.type === "textarea" ? (
                  <textarea
                    name={field.key}
                    required={field.required !== false}
                    maxLength={field.maxLength || 2000}
                    defaultValue={initial[field.key] || ""}
                  />
                ) : (
                  <input
                    name={field.key}
                    type={field.type === "uuid" ? "text" : field.type || "text"}
                    required={field.required !== false}
                    pattern={
                      field.type === "uuid" ? uuidPattern : field.pattern
                    }
                    maxLength={
                      field.maxLength || (field.type === "url" ? 2048 : 300)
                    }
                    defaultValue={initial[field.key] || ""}
                    placeholder={
                      field.type === "uuid"
                        ? "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        : field.placeholder
                    }
                    autoComplete="off"
                    onChange={
                      field.key === "articleImage"
                        ? (event) => setArticleImage(event.target.value)
                        : undefined
                    }
                  />
                )}
              </label>
            ))}
          </div>
          <PromoImage url={articleImage} />
          <button className={command.danger ? "danger" : "primary"}>
            {busy ? "En cours…" : command.title}
          </button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        {success && (
          <p role="status" className="success">
            {success}
          </p>
        )}
      </form>
      {pending && (
        <Confirmation
          title={command.title}
          consequence={command.consequence}
          fields={command.fields}
          values={pending}
          onCancel={() => setPending(null)}
          onConfirm={() => execute(pending)}
        />
      )}
    </details>
  );
}
