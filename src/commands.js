const limits = {
  ownerId: 36,
  promoId: 36,

  username: 30,
  store: 100,
  alias: 100,
  canonicalStore: 100,
  creatorName: 100,
  code: 80,
  articleName: 150,
  category: 80,
  documentVersion: 100,
  name: 100,
  bio: 1000,
  facts: 4000,
  exchanges: 4000,
  reason: 2000,
  dossierReference: 300,
  agreementReference: 300,
  emailReference: 300,

  reporterEmail: 254,
};
const field = (key, label, type = "text", options = {}) => ({
  key,
  label,
  type,
  maxLength: Object.hasOwn(limits, key)
    ? limits[key]
    : type === "url"
      ? 2048
      : undefined,
  ...options,
});
export const ownerField = field(
  "ownerId",
  "Compte propriétaire (UUID)",
  "uuid",
);
const promoField = field("promoId", "Offre (UUID)", "uuid");
const decisionFields = [
  ownerField,
  field("reason", "Motif", "textarea"),
  field("facts", "Faits", "textarea"),
  field("exchanges", "Échanges", "textarea"),
  field("dossierReference", "Référence dossier"),
];
const accountPath = (suffix) => (values) =>
  `accounts/${encodeURIComponent(values.ownerId)}/${suffix}`;
const promoPath = (suffix) => (values) =>
  `promos/${encodeURIComponent(values.promoId)}/${suffix}`;
export const commands = {
  jobs: {
    title: "Exécuter les échéances",
    danger: true,
    method: "POST",
    path: () => "jobs/run",
    noBody: true,
    description:
      "Balayage au temps serveur actuel, sans date arbitraire. Les jobs peuvent aussi être planifiés côté Feezit.",
    consequence:
      "Exécute les échéances réelles : masquage, retrait de codes/brouillons, suppression de fiches et purge de comptes inactifs selon leurs règles. Libération de marques et notifications mises en attente possibles. Ce n’est pas une simulation.",
    fields: [],
  },
  report: {
    title: "Signaler un problème",
    method: "POST",
    path: promoPath("reports"),
    pathFields: ["promoId"],
    description:
      "Simple signalement : ne vaut pas fraude établie et ne retire pas immédiatement le code.",
    success:
      "Signalement enregistré. Notifications mises en attente ; aucun envoi confirmé.",
    fields: [promoField, field("reporterEmail", "Email du signalant", "email")],
  },
  resolve: {
    title: "Résoudre le signalement",
    method: "PUT",
    path: promoPath("resolve"),
    pathFields: ["promoId"],
    noBody: true,
    description: "Après vérification réelle du fonctionnement par l’opérateur.",
    consequence:
      "Termine la procédure et remet en visibilité seulement si l’offre est complète. Ne prolonge pas automatiquement sa date d’expiration.",
    fields: [promoField],
  },
  fraud: {
    title: "Retirer pour fraude établie",
    danger: true,
    method: "POST",
    path: promoPath("fraud-removal"),
    pathFields: ["promoId"],
    fixed: { fraudEstablished: true },
    description:
      "Fraude déjà établie par examen humain ; conserver les preuves dans le circuit opérateur externe. Motif et référence ne sont pas archivés par cette commande.",
    consequence:
      "Je confirme une fraude établie : retire immédiatement le code et sa réservation, libère la marque et met des notifications en attente, sans bannir le compte ni supprimer le profil ou son historique. Aucun email envoyé par cette commande.",
    success:
      "Retrait confirmé. Compte et profil conservés, notifications éventuelles en attente.",
    fields: [
      promoField,
      field("reason", "Motif", "textarea"),
      field("dossierReference", "Référence dossier"),
    ],
  },
  mask: {
    title: "Masquer temporairement",
    method: "PUT",
    path: accountPath("moderation"),
    pathFields: ["ownerId"],
    description:
      "Dossier interne opérateur ; communication effective par votre canal externe.",
    consequence:
      "Masque le profil, conserve données et réservation. Pas de purge à 72 heures : ce n’est pas un retrait volontaire. Le contact est mis en attente, pas envoyé.",
    fields: decisionFields,
  },
  unmask: {
    title: "Lever le masquage",
    method: "DELETE",
    path: accountPath("moderation"),
    pathFields: ["ownerId"],
    noBody: true,
    description: "Après résolution réelle de la modération.",
    consequence:
      "Remet en visibilité, sauf bannissement ou retrait volontaire encore en cours. Ne restaure aucun contenu déjà supprimé.",
    fields: [ownerField],
  },
  ban: {
    title: "Bannir le compte",
    danger: true,
    method: "PUT",
    path: accountPath("ban"),
    pathFields: ["ownerId"],
    description:
      "Dossier complet, faits et échanges relus ; décision distincte d’un retrait de code.",
    consequence:
      "Révoque toutes les sessions et supprime profil, code, liens, références, suivis, attente, procédures et historique individuel. Libère la marque. Le compte et le dossier sont conservés pour réexamen ; la notification de décision reste en attente.",
    fields: decisionFields,
  },
  unban: {
    title: "Lever le bannissement",
    method: "DELETE",
    path: accountPath("ban"),
    pathFields: ["ownerId"],
    noBody: true,
    description: "Réexamen humain du dossier avant nouvelle participation.",
    consequence:
      "Lève le bannissement mais ne restaure ni profil, ni code, ni historique, ni badge, ni réservation. Aucun successeur n’est dépossédé. Un nouveau profil et un nouvel accord sont à préparer explicitement.",
    success: "Bannissement levé. Aucun contenu restauré automatiquement.",
    fields: [ownerField],
  },
  profile: {
    title: "Créer un nouveau profil",
    method: "POST",
    path: accountPath("profile"),
    pathFields: ["ownerId"],
    description:
      "Contenu nouveau, fourni et validé explicitement. Compte non banni sans profil uniquement.",
    consequence:
      "Crée un nouveau profil validé par l’opérateur. Ne restaure pas l’ancien contenu, le badge, le code, l’historique ou la marque ; l’accord et la réservation restent distincts.",
    fields: [
      ownerField,
      field("username", "Pseudo"),
      field("name", "Nom"),
      field("bio", "Biographie", "textarea", { required: false }),
      field("avatar", "Avatar (URL)", "url", { required: false }),
      field("category", "Catégorie"),
    ],
  },
  alias: {
    title: "Relier un alias",
    method: "PUT",
    path: () => "brands/aliases",
    description:
      "Revue humaine des variantes. Un cycle ou une marque déjà réservée peut bloquer la fusion.",
    consequence:
      "Cette opération fusionne les alias entrants et remappe atomiquement les attentes et réponses vers la marque canonique. Elle n’accorde aucune priorité ni nouvelle réservation.",
    fields: [
      field("alias", "Alias"),
      field("canonicalStore", "Marque canonique"),
    ],
  },
  waitlist: {
    title: "Ajouter à l’attente",
    method: "POST",
    path: () => "waitlist",
    description:
      "Inscription d’un intéressé. Pas de rang d’ancienneté et aucune attribution.",
    success:
      "Attente enregistrée. Aucune attribution ni émission email confirmée.",
    fields: [
      ownerField,
      field("store", "Marque"),
      field("creatorName", "Nom du créateur"),
      field("code", "Code", "text", { maxLength: 80 }),
    ],
  },
  response: {
    title: "Enregistrer une réponse favorable",
    method: "POST",
    path: () => "waitlist/responses",
    description:
      "Date réelle de réception de l’email ; les échanges puis l’accord restent une étape distincte.",
    success: "Réponse favorable enregistrée. Aucune attribution automatique.",
    fields: [
      ownerField,
      field("store", "Marque"),
      field("receivedAt", "Réponse reçue le (UTC)", "datetime-local"),
      field("emailReference", "Référence email"),
    ],
  },
  reservation: {
    title: "Préparer une réservation",
    method: "POST",
    path: () => "reservations",
    description:
      "Accord explicite et validation du contenu reçus par email, après examen humain. Les codes restent strictement inchangés.",
    consequence:
      "Réserve la marque au compte indiqué et crée un brouillon. Cette opération ne publie pas l’offre. Un brouillon incomplet est retiré après accord + 7 jours au passage du job.",
    success:
      "Réservation préparée en brouillon. Aucune publication automatique.",
    fields: [
      ownerField,
      field("store", "Marque"),
      field("code", "Code", "text", { maxLength: 80 }),
      field("articleName", "Article"),
      field("articleDescription", "Description de l’article", "textarea", {
        required: false,
        maxLength: 2000,
      }),
      field("articleImage", "Image de l’article (URL)", "url", {
        required: false,
        maxLength: 2048,
        pattern: "https?://.+",
      }),
      field("category", "Catégorie"),
      field("destinationUrl", "Destination", "url"),
      field("agreementReceivedAt", "Accord reçu le (UTC)", "datetime-local"),
      field("agreementReference", "Référence de l’accord"),
      field("documentVersion", "Version des documents"),
    ],
  },
};
