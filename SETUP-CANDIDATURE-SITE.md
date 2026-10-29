# 📨 Candidature directe depuis le site → ticket Discord

Le bouton **Postuler** du site ouvre un formulaire (ID Discord, pseudo RP, téléphone, ID unique, RIB, disponibilités).
À l'envoi, le bot ouvre un **ticket de recrutement au nom de la personne** (retrouvée par son ID Discord), avec toutes
ses informations et les boutons « Passer à l'entretien / Refuser » habituels. Elle reçoit aussi un message privé.

Avant de postuler, la personne doit cocher « Je suis déjà sur le Discord Oil Roxwood » ; sinon un bouton cliquable
« Rejoindre le Discord » s'affiche à la place du formulaire.

## Comment ça circule

```
Site (formulaire)  ──webhook──▶  salon privé #candidatures-site  ──lu par──▶  bot (cogs/candidature_site.py)
                                                                              └─▶ ticket dans la catégorie des candidatures
```

Le site est statique : il n'a pas de jeton de bot. Il dépose donc la candidature dans un salon privé par **webhook**,
et c'est le bot qui fait le reste.

## Mise en service (une seule fois)

1. **Discord** — crée un salon texte **privé** `#candidatures-site` (visible seulement du staff et du bot).
   Paramètres du salon → *Intégrations* → *Webhooks* → *Nouveau webhook* → **Copier l'URL du webhook**.
   Note aussi l'**ID du salon** (clic droit → Copier l'identifiant).
2. **Bot** — dans `cogs/.env`, ajoute la ligne :
   `ORX_SITE_CANDIDATURES_CHANNEL=ID_DU_SALON`
   Envoie par WinSCP dans `/root/Bot/` : `cogs/candidature_site.py` (nouveau), `cogs/candidature.py` et `main.py` (modifiés),
   puis `systemctl restart botoilroxwood`. Le bot a besoin du droit **Gérer les salons** (créer le ticket) et de
   **Voir / Envoyer / Joindre des fichiers** dans la catégorie des candidatures.
3. **Site** — dans `index.html`, colle l'URL du webhook dans `window.ROXWOOD_SITE.webhookCandidature`, puis publie.
   Tant que cette valeur est vide, « Postuler » renvoie simplement vers le Discord : rien ne casse.

## Sécurité — à savoir

L'URL du webhook est visible dans le code du site : **n'importe qui peut donc y écrire**. Le bot ne croit rien sur parole :
l'ID doit être celui d'un vrai membre du serveur, un seul ticket à la fois par personne, 10 min entre deux candidatures,
6 candidatures par minute au maximum. Le pire cas est du bruit dans un salon privé. Si besoin : supprimer le webhook dans
Discord, en créer un autre, remplacer l'URL dans `index.html`.

## Ce que le site ne peut pas faire

Envoyer la carte d'identité et le permis : ils sont demandés **dans le ticket**, comme avant, et le bot les reconnaît
toujours automatiquement.

---

# ⛽ Commande de bidons depuis le site → ticket commande

Même principe, pour le service commercial. Le bouton **« Commander des bidons »** (section « Entreprises & familles »)
ouvre un formulaire : ID Discord, nom de l'entreprise ou de la famille, téléphone, quantité (avec estimation à
180 $ HT le bidon), lieu de livraison, date et heure souhaitées. La personne coche d'abord « Je suis déjà sur le Discord »
(sinon bouton « Rejoindre »).

Le bot (`cogs/commande_site.py`) ouvre un **ticket commande** dans `COMMERCIAL_CATEGORY_ID` au nom du client — ou ajoute la
commande à son ticket s'il en a déjà un — enregistre les mêmes données que le bouton « Nouvelle commande », ping le rôle
commercial avec « Commande prise en compte », demande la photo du lieu et envoie un message privé au client.

## Mise en service

1. **Discord** — salon privé `#commandes-site` (staff et bot) + un webhook dedans ; note l'URL et l'ID du salon.
2. **Bot** — dans `cogs/.env` : `ORX_SITE_COMMANDES_CHANNEL=ID_DU_SALON`. Envoie dans `/root/Bot/` :
   `cogs/commande_site.py` (nouveau), `cogs/commercial.py` et `main.py` (modifiés), puis `systemctl restart botoilroxwood`.
   Le bot a besoin de **Gérer les salons** et de voir / écrire / joindre des fichiers dans la catégorie des commandes.
3. **Site** — colle l'URL du webhook dans `index.html`, `window.ROXWOOD_SITE.webhookCommande`, puis publie.
   Tant qu'elle est vide, le bouton renvoie vers le Discord (et le 986).

Mêmes garde-fous que pour les candidatures (ID de membre réel, 5 min entre deux commandes d'une même personne, 10 par minute
au maximum). Ce circuit utilise un **second** webhook et un **second** salon : ne mélange pas avec `#candidatures-site`.
