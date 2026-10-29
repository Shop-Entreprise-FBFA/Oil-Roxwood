# 🛡️ Relais Cloudflare — candidature et commande depuis le site

**Pourquoi.** Ce dépôt est public. Une adresse de webhook Discord écrite dedans est détectée par GitHub, qui prévient
Discord, qui **supprime** le webhook (c'est arrivé le 29/10 : « Utilisateur inconnu a supprimé le webhook »).
Le site envoie donc ses formulaires à un petit **relais Cloudflare** ; l'adresse du webhook vit dans un *secret*
Cloudflare et n'apparaît **jamais** dans le dépôt ni dans le navigateur des visiteurs.

```
Site (formulaire) ──▶ Relais Cloudflare (vérifie tout) ──▶ webhook ──▶ salon privé ──▶ bot ──▶ ticket
```

Le relais (`relais-cloudflare/worker.js`) revérifie chaque champ, reconstruit lui-même le message, interdit toute mention
(@everyone…), n'accepte que de vraies images pour les pièces, filtre l'origine (ton site seulement) et limite le débit
par visiteur. **Le bot ne change pas.**

## Mise en service (5 minutes, une seule fois)

1. **Cloudflare** → *Workers & Pages* → **Create** → **Create Worker** → nomme-le `oilroxwood-relais` → **Deploy**.
2. Clique **Edit code**, supprime le code d'exemple, colle **tout** le contenu de `relais-cloudflare/worker.js`, puis **Deploy**.
3. Onglet **Settings** → **Variables and Secrets** → **Add** :
   - Type **Secret**, nom `WEBHOOK_URL`, valeur : l'adresse du webhook Discord du salon privé ;
   - Type **Text**, nom `ALLOWED_ORIGINS`, valeur : `https://shop-entreprise-fbfa.github.io`
   puis **Deploy**.
4. Copie l'adresse du Worker (ex. `https://oilroxwood-relais.TON-COMPTE.workers.dev`) et donne-la à Claude, ou colle-la dans
   `index.html` : `window.ROXWOOD_SITE = { …, relais: "https://oilroxwood-relais.TON-COMPTE.workers.dev" }`.

## Règles à respecter

- **Ne jamais** coller l'adresse d'un webhook dans le dépôt (site, dashboard, documents). Elle ne va que dans le secret Cloudflare.
- **Ne pas supprimer** le webhook du salon : le relais en dépend. Pour changer son nom ou son icône, le modifier, pas le recréer.
- Si le webhook disparaît quand même, le site affiche « momentanément indisponible » ; il suffit d'en créer un autre dans
  le salon et de remplacer le secret `WEBHOOK_URL` dans Cloudflare (le site n'est pas touché).

## Limites du relais

Un envoi par visiteur toutes les 90 s (candidature) et 45 s (commande) ; 9 Mo maximum par requête, 4 Mo par image ;
images JPEG, PNG ou WebP uniquement.
