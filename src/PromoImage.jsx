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
export function PromoImage({ url, privateSource }) {
  const source =
    typeof privateSource === "string" &&
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(privateSource)
      ? privateSource
      : url;
  return (source === privateSource || safeImageUrl(source)) && source ? (
    <ImagePreview key={source} url={source} />
  ) : null;
}
