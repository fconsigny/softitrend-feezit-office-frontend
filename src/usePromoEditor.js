import { useEffect, useRef, useState } from "react";
import { isAborted } from "./api.js";

const partialMessage =
  "Enregistrement accepté par le serveur ; la relecture a échoué. État relu indisponible. Relire ne renvoie aucune modification.";
const fieldsOf = (record, keys) =>
  Object.fromEntries(keys.map((key) => [key, record[key] ?? ""]));

// One independent draft and verification state per mutation, never an automatic PUT retry.
export function usePromoEditor({
  client,
  promoId,
  revision,
  refresh,
  suffix,
  keys,
  successMessage,
  record,
  setRecord,
  readOnRevision = true,
  freshness,
  readRelated,
  publishRelated,
}) {
  const [values, setValues] = useState(() => fieldsOf(record ?? {}, keys));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!record);
  const [pending, setPending] = useState(null);
  const [partial, setPartial] = useState(false);
  const dirty = useRef(false);
  const editVersion = useRef(0);
  const submittedVersion = useRef(0);
  const read = useRef();
  const mutation = useRef();
  const mutating = useRef(false);
  const needsVerification = useRef(false);
  const path = `promos/${encodeURIComponent(promoId)}`;
  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => {
    if (
      record &&
      !dirty.current &&
      !mutating.current &&
      !needsVerification.current
    )
      setValues(fieldsOf(record, keys));
  }, [record, keys]);
  useEffect(() => {
    if (!readOnRevision || mutating.current || needsVerification.current)
      return;
    const controller = new AbortController();
    const readGeneration = freshness.current;
    read.current = controller;
    setLoading(true);
    setError("");
    client.management(path, { signal: controller.signal }).then(
      (data) => {
        if (controller.signal.aborted) return;
        if (readGeneration === freshness.current) setRecord(data);
        setLoading(false);
      },
      (failure) => {
        if (!controller.signal.aborted && !isAborted(failure)) {
          if (readGeneration === freshness.current) setError(failure.message);
          setLoading(false);
        }
      },
    );
    return () => controller.abort();
  }, [client, path, revision, readOnRevision, setRecord, freshness]);

  function change(key, value) {
    dirty.current = true;
    editVersion.current++;
    setSuccess("");
    setValues((previous) => ({ ...previous, [key]: value }));
  }
  function prepare(content) {
    // The dialog confirms this snapshot, not edits made while it is open.
    submittedVersion.current = editVersion.current;
    setPending(content);
  }
  async function save(content, rereadOnly = false) {
    if (mutating.current || (!rereadOnly && needsVerification.current)) return;
    setPending(null);
    setBusy(true);
    mutating.current = true;
    read.current?.abort();
    setLoading(false);
    setSuccess("");
    setError("");
    const controller = new AbortController();
    mutation.current = controller;
    let accepted = rereadOnly;
    try {
      if (!rereadOnly) {
        // Fence reads started before AND during either form's PUT. The ref is
        // scoped to the mounted offer/session, not a persistent private cache.
        freshness.current++;
        try {
          await client.management(`${path}/${suffix}`, {
            method: "PUT",
            data: content,
            signal: controller.signal,
          });
        } finally {
          freshness.current++;
        }
        accepted = true;
      }
      if (controller.signal.aborted) return;
      const readGeneration = freshness.current;
      const updated = await client.management(path, {
        signal: controller.signal,
      });
      const related = readRelated ? await readRelated(controller.signal) : null;
      if (controller.signal.aborted) return;
      if (readGeneration !== freshness.current) {
        needsVerification.current = true;
        setPartial(true);
        setError(
          "Enregistrement accepté par le serveur ; relecture devenue obsolète après une autre sauvegarde. Relire ne renvoie aucune modification.",
        );
        return;
      }
      freshness.current++;
      setRecord(updated);
      publishRelated?.(related);
      if (submittedVersion.current === editVersion.current) {
        setValues(fieldsOf(updated, keys));
        dirty.current = false;
      }
      needsVerification.current = false;
      setPartial(false);
      setSuccess(successMessage);
      refresh();
    } catch (failure) {
      if (!controller.signal.aborted && !isAborted(failure)) {
        needsVerification.current = accepted;
        setPartial(accepted);
        setError(accepted ? partialMessage : failure.message);
      }
    } finally {
      if (!controller.signal.aborted) {
        mutating.current = false;
        setBusy(false);
      }
    }
  }
  return {
    record,
    values,
    change,
    error,
    setError,
    success,
    setSuccess,
    busy,
    loading,
    pending,
    prepare,
    setPending,
    partial,
    save,
    reread: () => save(null, true),
  };
}
