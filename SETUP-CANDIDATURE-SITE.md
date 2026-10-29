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
