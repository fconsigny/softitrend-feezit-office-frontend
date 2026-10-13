import { useState } from "react";
export function safeImageUrl(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
function ImagePreview({ url }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <p className="muted">Aperçu indisponible. L’URL reste consultable.</p>
  ) : (
    <img
      className="promo-preview"
      src={url}
      alt="Aperçu de l’article"
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
export function PromoImage({ url }) {
  return safeImageUrl(url) ? <ImagePreview key={url} url={url} /> : null;
}
