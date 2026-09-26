# Trace Analyst

Construis une application web appelée ETM Analyzer, une plateforme scientifique d'analyse, d'interprétation et de cartographie des Éléments Traces Métalliques (ETM) dans l'eau, le sol et l'air. C'est un outil destiné à des chercheurs, étudiants en géosciences et environnementalistes pour évaluer la conformité de mesures de pollution par rapport à des normes internationales, calculer des indices de pollution géochimiques, interpoler spatialement les concentrations et générer des rapports scientifiques.


1. Direction artistique souhaitée
Style : dashboard scientifique moderne, épuré, professionnel (inspiration : outils type Datawrapper, Mapbox Studio, ou dashboards de data science)
Palette : tons "environnement/eau/terre" — bleu profond, vert émeraude, gris ardoise, avec des accents orange/rouge pour les alertes de dépassement
Typographie claire, hiérarchisée (titres en semi-bold, corps en regular)
Cartes ("cards") avec ombres légères, coins arrondis, espacement généreux
Mode clair par défaut, envisager un mode sombre
Layout en sidebar fixe (paramètres) + zone de contenu principale scrollable, avec navigation par sections/onglets plutôt qu'une longue page unique
2. Structure de navigation


Import des données
Vue d'ensemble / Tableau de bord
Analyse de conformité
Indices de pollution
Graphiques
Cartographie & Interpolation (IDW / Kriging)
Rapport & Export
Références scientifiques
3. Paramètres globaux (Sidebar)
Sélecteur Matrice : Eau / Sol / Air
Sélecteur Référentiel normatif (dépend de la matrice choisie, ex. OMS, CCME, etc.)
Panneau extensible "Vérification du référentiel" : tableau des limites réglementaires chargées (Élément, Limite, Unité, Période)
4. Import des données
Zone de drag & drop pour importer un fichier CSV
Bouton "Utiliser des données d'exemple" (jeu de données factice de démonstration)
Bouton "Télécharger le modèle CSV" (gabarit vide avec les bonnes colonnes)
Colonnes obligatoires du CSV : Station, Latitude, Longitude, Date, Matrice, Element, Concentration, Unite
Validation automatique : colonnes manquantes affichées en erreur claire, message si aucune donnée ne correspond à la matrice sélectionnée
Nettoyage automatique (valeurs non numériques ignorées, lignes incomplètes supprimées)
Aperçu des données sous forme de tableau filtrable/triable après import
5. Tableau de bord (vue d'ensemble)

Cartes de métriques ("KPI cards") en haut de page :

Nombre de stations
Nombre d'éléments analysés
Nombre total de mesures
Nombre de mesures conformes
Nombre de dépassements
Barre de progression + pourcentage de taux de conformité global
6. Analyse de conformité
Tableau comparant chaque mesure à la norme applicable : Station, Élément, Concentration, Limite, Unité, Période, Ratio (Concentration/Limite), Statut (Conforme / Dépassement / Norme non disponible)
Mise en valeur visuelle des dépassements (ligne en rouge/orange)
Sous-section "Dépassements détectés" : tableau filtré + graphique en barres du nombre de dépassements par élément
Tableau des concentrations maximales par élément
7. Indices de pollution géochimiques

Interface de saisie des concentrations de référence par élément (valeurs de fond géochimique, une pour chaque élément détecté), utilisées pour calculer les indices suivants :

FC (Facteur de Contamination) = Concentration / Référence
Igeo (Indice de géoaccumulation, Müller 1969) = log2(Concentration / (1.5 × Référence))
PI (Indice de pollution, = FC)
Er (Facteur de risque écologique individuel) = FC × facteur toxicologique de l'élément (Cr=2, Cu=5, Zn=1, Pb=5, Cd=30, As=10, Hg=40, Co=5, Ni=5)
PLI (Indice de charge polluante, Tomlinson et al. 1980) = moyenne géométrique des FC par station
Cd (Degré de contamination, Hakanson 1980) = somme des FC par station
RI (Indice de risque écologique, Hakanson 1980) = somme des Er par station
Nemerow = racine((moyenne(PI)² + max(PI)²) / 2) par station

Chaque indice doit être affiché avec son interprétation qualitative textuelle (ex. Igeo : "Non pollué" → "Extrêmement pollué" ; FC : "Absence de contamination" → "Contamination très élevée")

Tableau complet exportable des résultats par station et élément.

8. Graphiques
Sélecteur de variable (Concentration, FC, Igeo, PI, Er)
Sélecteur d'élément (ou "Tous")
Graphique en barres dynamique : variable choisie par station
Prévoir des graphiques interactifs (survol pour voir la valeur exacte) plutôt que des images statiques
9. Cartographie et interpolation spatiale
Sélecteur de variable cartographique (Concentration, FC, Igeo, PI, Er, PLI, Cd, RI, Nemerow)
Carte interactive affichant les stations géolocalisées, avec marqueurs colorés selon l'intensité de la valeur
Tableau des données spatiales associées
Interpolation IDW (Inverse Distance Weighting) : grille interpolée affichée en carte de chaleur/contours, avec paramètre de puissance ajustable
Interpolation par Krigeage ordinaire : sélection du modèle de variogramme, carte interpolée en isocontours, statistiques (min/moyenne/max), et validation croisée (MAE, RMSE, Biais) avec tableau observé vs. prédit
Avertissement scientifique visible : les résultats d'interpolation sont préliminaires, les coordonnées devraient être projetées en système métrique pour une étude rigoureuse
10. Export et rapport
Bouton d'export CSV des résultats
Bouton de génération de rapport Word (.docx) regroupant automatiquement : données brutes, résultats de conformité, indices de pollution, graphiques, coordonnées des stations et bibliographie

## Stack technique

- [TanStack Start](https://tanstack.com/start) (React 19, SSR)
- [TanStack Router](https://tanstack.com/router) — routage par fichiers (`src/routes/`)
- Tailwind CSS 4 + [shadcn/ui](https://ui.shadcn.com/) (`src/components/ui/`)
- Recharts pour les graphiques, `docx` pour la génération de rapports Word

## Développement

Prérequis : Node.js (≥ 18) et npm, ou [Bun](https://bun.sh/).

```sh
git clone <url-de-ce-dépôt>
cd <nom-du-dépôt>
npm install
npm run dev
```

Autres scripts disponibles (`package.json`) :

```sh
npm run build     # build de production
npm run preview   # prévisualiser le build
npm run lint       # linter
npm run format     # formatage avec Prettier
```
