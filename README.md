# 📖 Bible par thèmes

Application pour **étudier, méditer et écouter la Bible par thème** : l'amour, la louange, la foi, la paix…
On choisit un thème, on lit les versets, on les **écoute** à voix haute et on prend le temps de **méditer**.

Texte : **Louis Segond 1910** (domaine public), toute la Bible (66 livres, 31 102 versets) incluse dans l'application.

## Fonctionnalités

- **22 thèmes** avec plus de 450 passages clés choisis pour la méditation :
  Amour · Louange et adoration · Foi · Espérance · Paix · Joie · Pardon et miséricorde · Prière · Grâce et salut ·
  Force et courage · Protection et confiance · Consolation dans l'épreuve · Guérison · Sagesse · Dieu pourvoit ·
  Reconnaissance · Le Saint-Esprit · Humilité · La Parole de Dieu · Fidélité de Dieu · Patience et persévérance · Vie éternelle.
- **« Toute la Bible »** pour chaque thème : tous les versets qui contiennent les mots du thème
  (ex. pour l'amour : *amour, aimer, aimé, charité…* → 593 versets), avec filtre Ancien / Nouveau Testament.
- **Écoute audio** : la liste des versets est lue à voix haute l'un après l'autre
  - annonce de la référence (« Jean, chapitre 3, verset 16 »)
  - **silence pour méditer** entre les passages (de 0 s à 1 min)
  - répéter chaque passage 1, 2 ou 3 fois, lecture en boucle
  - choix de la voix et de la vitesse, **arrêt automatique** (10 min à 1 h)
  - l'écran reste allumé pendant l'écoute
- **Mode méditation** : un passage à la fois en grand, avec des pistes (lire, comprendre, prier, vivre)
  et un espace pour écrire **ce que Dieu vous dit**.
- **Recherche** : un thème, un mot (« berger »), une expression entre guillemets (« "ne crains point" »)
  ou une référence (« Jean 3:16 », « Ps 23 », « 1 Co 13 »). Les accents sont facultatifs.
- **Lecture de la Bible** chapitre par chapitre, pour voir le contexte de chaque verset et l'écouter.
- **Mes versets** : passages gardés et notes de méditation (enregistrés sur l'appareil).
- **Verset du jour**, mode sombre, taille du texte réglable.
- **Fonctionne hors connexion** et **s'installe sur le téléphone** comme une application (PWA).

## Utiliser l'application

### Sur l'ordinateur

```bash
npm start          # puis ouvrir http://localhost:8000
```

(Node.js 18 ou plus récent ; aucune dépendance à installer.)

### Sur le téléphone

Publiez l'application (voir ci-dessous), ouvrez l'adresse dans le navigateur, puis :

- **Android (Chrome)** : menu ⋮ → *Ajouter à l'écran d'accueil* / *Installer l'application*.
- **iPhone (Safari)** : bouton Partager → *Sur l'écran d'accueil*.

### Publier gratuitement avec GitHub Pages

Le fichier `.github/workflows/pages.yml` publie l'application automatiquement à chaque mise à jour de la branche `main`.
À faire une seule fois : dans le dépôt GitHub, **Settings → Pages → Source : « GitHub Actions »**.
L'application sera alors disponible à l'adresse `https://<votre-compte>.github.io/bible-app/`.

## À propos de l'audio

L'audio utilise la **synthèse vocale de l'appareil** (Web Speech API) : aucune connexion n'est nécessaire et
tout le texte de la Bible peut être écouté. La qualité dépend des voix installées :

- **Android** : Réglages → Accessibilité → Synthèse vocale → installer la voix *Français* de Google.
- **iPhone** : Réglages → Accessibilité → Contenu énoncé → Voix → Français → télécharger une voix « améliorée ».
- **Windows / Edge** : les voix « Natural » en ligne sont très agréables.

Choisissez ensuite la voix dans l'application (bouton ⚙ du lecteur).

> Limite connue : sur certains téléphones, la lecture s'interrompt si l'écran est verrouillé.
> L'application garde l'écran allumé pendant l'écoute pour l'éviter.

## Ajouter ou modifier un thème

Les thèmes sont définis dans [`tools/themes.mjs`](tools/themes.mjs) :

```js
{
  id: 'amour',
  name: 'Amour',
  icon: '❤️',
  color: '#c2415b',
  description: "L'amour de Dieu pour nous…",
  keywords: ['\\bamour\\w*', '\\baim\\w*', '\\bcharit\\w*'], // pour « Toute la Bible » (texte sans accents)
  refs: ['Jn 3.16', '1Jn 4.7-8', '1Co 13.4-7'],              // passages clés
}
```

Puis régénérez les données :

```bash
npm run build   # vérifie chaque référence et produit data/themes.json et data/bible.json
npm test
```

Les références suivent la numérotation classique des versets (celle des éditions numériques courantes de la
Segond 1910 : dans les Psaumes, le titre fait partie du verset 1).

Après une modification, changez `VERSION` dans `sw.js` pour que les téléphones récupèrent la nouvelle version.

## Structure

```
index.html            page unique de l'application
css/style.css         mise en page (clair / sombre, mobile)
js/app.js             vues : thèmes, recherche, lecture, mes versets, méditation
js/audio.js           lecteur audio (synthèse vocale, pauses, répétition, minuterie)
js/bible.js           chargement des données et recherche
js/books.js           livres de la Bible, analyse des références
js/store.js           favoris, notes et réglages (stockés sur l'appareil)
data/bible.json       Bible Louis Segond 1910 complète
data/themes.json      thèmes générés (ne pas modifier à la main)
tools/themes.mjs      définition des thèmes (à modifier)
tools/build.mjs       génération des données
sw.js                 fonctionnement hors connexion
```

## Pistes pour la suite

- Enregistrements audio d'une voix humaine (fichiers MP3 par chapitre) en plus de la synthèse vocale.
- Publication sur le Play Store / App Store en emballant cette application avec Capacitor.
- Plans de méditation (« 7 jours sur l'amour »), partage d'un verset en image, autres traductions.

---

Texte biblique : Louis Segond 1910, domaine public (source numérique : [midvash/bible-data](https://github.com/midvash/bible-data)).
