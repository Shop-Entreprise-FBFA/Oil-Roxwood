/**
 * OIL ROXWOOD — relais Cloudflare entre le site public et le salon Discord des candidatures / commandes.
 *
 * Pourquoi : une adresse de webhook Discord écrite dans le code d'un site (dépôt public) est détectée par GitHub, qui
 * prévient Discord, qui SUPPRIME le webhook. Ici l'adresse vit dans un secret Cloudflare (WEBHOOK_URL) : elle n'est
 * jamais dans le dépôt, ni dans le navigateur des visiteurs.
 *
 * Ce relais ne transmet rien tel quel : il revérifie chaque champ, reconstruit lui-même le message
 * (« ORX-CANDIDATURE » / « ORX-COMMANDE » + bloc json, lu par cogs/candidature_site.py et cogs/commande_site.py),
 * interdit toute mention (@everyone, rôles…), limite la taille, n'accepte que les images pour les pièces, filtre l'origine
 * et limite le débit par visiteur.
 *
 * Routes :  POST /candidature   (multipart : payload_json + files[0] carte d'identité + files[1] permis)
 *           POST /commande      (json : { content: "ORX-COMMANDE ```json {...}``` " })
 *
 * Réglages (Cloudflare → Workers → Paramètres) :
 *   WEBHOOK_URL      (secret)   adresse du webhook du salon privé
 *   ALLOWED_ORIGINS  (variable) origines autorisées, séparées par des virgules
 *                               ex : https://shop-entreprise-fbfa.github.io
 */

const RE_ID = /^\d{17,20}$/;
const RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_CORPS = 9 * 1024 * 1024;          // 9 Mo pour toute la requête
const MAX_PIECE = 4 * 1024 * 1024;          // 4 Mo par image (le site les réduit à ~1 Mo)
const DELAI_S = { candidature: 90, commande: 45 };   // un envoi par visiteur et par délai (secondes)

const LIMITES_CANDIDATURE = { pseudo: 100, numero: 50, rib: 100, id_unique: 50, disponibilites: 200 };
const LIMITES_COMMANDE = { nom_entreprise: 100, telephone: 50, lieu_livraison: 200 };

function origines(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
}

function entetes(env, origine) {
  const ok = origine && origines(env).includes(origine);
  return {
    "Access-Control-Allow-Origin": ok ? origine : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function reponse(env, origine, statut, message) {
  return new Response(statut === 204 ? null : JSON.stringify({ erreur: message || "" }), {
    status: statut,
    headers: { ...entetes(env, origine), "Content-Type": "application/json" },
  });
}

/** Cherche le bloc ```json {...} ``` d'un contenu de message et renvoie l'objet, ou null. */
function lireBloc(contenu, marqueur) {
  const c = String(contenu || "").trim();
  if (!c.startsWith(marqueur)) return null;
  const m = c.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]);
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch (e) {
    return null;
  }
}

function texte(v, max) {
  return String(v == null ? "" : v).replace(/`{3,}/g, "'''").replace(/\s+/g, " ").trim().slice(0, max);
}

function champsCommuns(brut) {
  const did = String(brut.discord_id || "").trim();
  return RE_ID.test(did) ? { discord_id: did } : null;
}

function validerCandidature(brut) {
  const out = champsCommuns(brut);
  if (!out) return null;
  for (const [k, max] of Object.entries(LIMITES_CANDIDATURE)) {
    out[k] = texte(brut[k], max);
    if (!out[k]) return null;
  }
  return out;
}

function validerCommande(brut) {
  const out = champsCommuns(brut);
  if (!out) return null;
  for (const [k, max] of Object.entries(LIMITES_COMMANDE)) {
    out[k] = texte(brut[k], max);
    if (!out[k]) return null;
  }
  const q = String(brut.quantite || "").trim();
  if (!/^\d{1,6}$/.test(q) || +q < 1 || +q > 100000) return null;
  out.quantite = String(+q);
  const d = String(brut.date || "").trim().match(RE_DATE), h = String(brut.heure || "").trim().match(RE_HEURE);
  if (!d || !h) return null;
  const jour = Date.UTC(+d[1], +d[2] - 1, +d[3]);
  if (new Date(jour).getUTCDate() !== +d[3]) return null;             // 31/02 et autres dates impossibles
  const ecart = (jour - Date.now()) / 86400000;
  if (ecart < -1.5 || ecart > 400) return null;                       // passé ou trop lointain
  out.date = d[0];
  out.heure = h[0];
  return out;
}

function message(marqueur, donnees) {
  const complet = { ...donnees, v: 2, src: "site", t: new Date().toISOString() };
  return `${marqueur}\n\`\`\`json\n${JSON.stringify(complet)}\n\`\`\``;
}

/** Un envoi par visiteur et par route : mémorisé dans le cache de Cloudflare (pas de base à configurer). */
async function tropRapide(request, route) {
  const ip = request.headers.get("CF-Connecting-IP") || "inconnue";
  const cle = new Request(`https://limite.relais.local/${route}/${encodeURIComponent(ip)}`);
  const cache = caches.default;
  if (await cache.match(cle)) return true;
  await cache.put(cle, new Response("1", { headers: { "Cache-Control": `max-age=${DELAI_S[route]}` } }));
  return false;
}

async function versDiscord(env, corps, enTetes) {
  const r = await fetch(env.WEBHOOK_URL, { method: "POST", body: corps, headers: enTetes });
  return r;
}

async function candidature(request, env, origine) {
  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return reponse(env, origine, 400, "formulaire illisible");
  }
  let payload;
  try {
    payload = JSON.parse(String(form.get("payload_json") || "{}"));
  } catch (e) {
    return reponse(env, origine, 400, "payload illisible");
  }
  const brut = lireBloc(payload.content, "ORX-CANDIDATURE");
  const donnees = brut && validerCandidature(brut);
  if (!donnees) return reponse(env, origine, 400, "candidature invalide");

  const pieces = [form.get("files[0]"), form.get("files[1]")];
  for (const f of pieces) {
    if (!f || typeof f === "string" || !/^image\/(jpeg|png|webp)$/.test(f.type || "")) {
      return reponse(env, origine, 400, "deux images (carte d'identité et permis) sont obligatoires");
    }
    if (f.size > MAX_PIECE) return reponse(env, origine, 413, "image trop lourde");
  }
  if (await tropRapide(request, "candidature")) return reponse(env, origine, 429, "trop de demandes");

  const sortie = new FormData();
  sortie.append("payload_json", JSON.stringify({
    username: "Candidatures · site",
    allowed_mentions: { parse: [] },
    content: message("ORX-CANDIDATURE", donnees),
  }));
  const ext = (t) => (t === "image/png" ? "png" : t === "image/webp" ? "webp" : "jpg");
  sortie.append("files[0]", pieces[0], `carte-identite.${ext(pieces[0].type)}`);
  sortie.append("files[1]", pieces[1], `permis.${ext(pieces[1].type)}`);

  const r = await versDiscord(env, sortie);
  return r.ok ? reponse(env, origine, 204) : reponse(env, origine, r.status === 404 ? 503 : 502, "discord");
}

async function commande(request, env, origine) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return reponse(env, origine, 400, "json illisible");
  }
  const brut = lireBloc(payload && payload.content, "ORX-COMMANDE");
  const donnees = brut && validerCommande(brut);
  if (!donnees) return reponse(env, origine, 400, "commande invalide");
  if (await tropRapide(request, "commande")) return reponse(env, origine, 429, "trop de demandes");

  const r = await versDiscord(env, JSON.stringify({
    username: "Commandes · site",
    allowed_mentions: { parse: [] },
    content: message("ORX-COMMANDE", donnees),
  }), { "Content-Type": "application/json" });
  return r.ok ? reponse(env, origine, 204) : reponse(env, origine, r.status === 404 ? 503 : 502, "discord");
}

export default {
  async fetch(request, env) {
    const origine = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: entetes(env, origine) });
    if (request.method !== "POST") return reponse(env, origine, 405, "méthode non autorisée");
    if (!origines(env).includes(origine)) return reponse(env, origine, 403, "origine refusée");
    if (!env.WEBHOOK_URL) return reponse(env, origine, 503, "relais non configuré");
    if (+(request.headers.get("Content-Length") || 0) > MAX_CORPS) return reponse(env, origine, 413, "trop gros");

    try {
      if (url.pathname === "/candidature") return await candidature(request, env, origine);
      if (url.pathname === "/commande") return await commande(request, env, origine);
    } catch (e) {
      return reponse(env, origine, 502, "erreur interne");
    }
    return reponse(env, origine, 404, "introuvable");
  },
};
