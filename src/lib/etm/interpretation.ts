import { convert, fmt, interp, type ConfRow, type IndexRow, type Row, type StationIdx } from "./analysis";
import { BASE_UNIT, CRUST_BACKGROUND, type Matrix } from "./norms";
import { projector, type CVResult, type SPoint, type VModel, type fitVariogram } from "./spatial";

/**
 * Interprétations automatiques du rapport : textes prédéfinis dont les phrases sont choisies et
 * complétées (chiffres, noms de stations et d'éléments) selon les résultats calculés.
 * Aucune IA : mêmes données → même texte. Les seuils de qualification viennent des méthodes
 * citées (Müller, Tomlinson, Hakanson, Nemerow) via `interp`, sauf les repères marqués « convention ».
 */

export interface ReportInput {
  matrix: string;
  normName: string;
  rows: Row[];
  conf: ConfRow[];
  idx: IndexRow[];
  stations: StationIdx[];
  elements: string[];
  kpi: { stations: number; total: number; ok: number; over: number; rate: number };
}
export interface Item {
  title?: string;
  text: string;
}
type Fit = ReturnType<typeof fitVariogram>;

/* ---------- Mise en forme française ---------- */
const NB = "\u00A0";
const fr = (v: number | null | undefined, d = 2) => fmt(v, d).replace(".", ",");
const pct = (x: number, d = 1) => `${fr(x, d)}${NB}%`;
const pl = (n: number, s: string, p?: string) => (n >= 2 ? (p ?? `${s}s`) : s);
const list = (a: string[]) => (a.length <= 1 ? (a[0] ?? "") : `${a.slice(0, -1).join(", ")} et ${a[a.length - 1]}`);
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const sector = (dx: number, dy: number) => {
  const a = (Math.atan2(dx, dy) * 180) / Math.PI;
  return ["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"][Math.round(((a + 360) % 360) / 45) % 8]!;
};

/* ---------- Statistiques par élément ---------- */
interface ElStat {
  element: string;
  rated: ConfRow[];
  over: ConfRow[];
  high: number;
  maxRow: ConfRow | null;
  stationsOver: string[];
  stationsRated: number;
  persistence: "persistante" | "variable" | "inconnue";
}
function elementStats(d: ReportInput): ElStat[] {
  return d.elements.map((element) => {
    const rated = d.conf.filter((c) => c.element === element && c.status !== "Norme non disponible");
    const over = rated.filter((c) => c.status === "Dépassement");
    const maxRow = rated.reduce<ConfRow | null>((b, c) => (!b || (c.ratio ?? -1) > (b.ratio ?? -1) ? c : b), null);
    const stationsOver = [...new Set(over.map((c) => c.station))];
    let multi = 0;
    let persist = 0;
    for (const s of stationsOver) {
      const m = rated.filter((c) => c.station === s);
      if (m.length >= 2) {
        multi++;
        if (m.every((c) => c.status === "Dépassement")) persist++;
      }
    }
    return {
      element,
      rated,
      over,
      high: over.filter((c) => (c.ratio ?? 0) > 2).length,
      maxRow,
      stationsOver,
      stationsRated: new Set(rated.map((c) => c.station)).size,
      persistence: multi === 0 ? "inconnue" : persist === multi ? "persistante" : "variable",
    };
  });
}
const dateOf = (r: ConfRow) => (r.date ? ` (${r.date})` : "");
const dateComma = (r: ConfRow) => (r.date ? `, ${r.date}` : "");
const EL_NAME: Record<string, string> = { Pb: "plomb", Cd: "cadmium", Cr: "chrome", Cu: "cuivre", Zn: "zinc", As: "arsenic", Hg: "mercure", Ni: "nickel", Co: "cobalt" };
const nm = (el: string) => (EL_NAME[el] ? ` (${EL_NAME[el]})` : "");

/* ---------- Bloc 1 : synthèse ---------- */
export function interpretSynthesis(d: ReportInput): Item[] {
  const out: Item[] = [];
  const k = d.kpi;
  const withNorm = k.ok + k.over;
  const nEl = d.elements.length;
  let t = `L'analyse porte sur ${k.total} ${pl(k.total, "mesure")} réparties sur ${k.stations} ${pl(k.stations, "station")} et ${nEl} ${pl(nEl, "élément")} (${d.elements.join(", ")}), en matrice ${d.matrix.toLowerCase()}. ${d.normName ? `Elles sont comparées aux limites du référentiel « ${d.normName} ».` : "Aucun référentiel n'est sélectionné."}`;
  if (withNorm < k.total) t += ` ${k.total - withNorm} ${pl(k.total - withNorm, "mesure")} (${pct((100 * (k.total - withNorm)) / k.total)}) ${pl(k.total - withNorm, "n'a pas pu être comparée", "n'ont pas pu être comparées")} faute de limite applicable dans ce référentiel.`;
  out.push({ text: t });

  if (withNorm === 0) {
    out.push({ text: "Aucune comparaison réglementaire n'est possible avec le référentiel choisi : le taux de conformité ne peut pas être établi." });
  } else {
    const r = k.rate;
    // Repères de lecture du taux global (convention de l'application, à valider)
    const verdict =
      r >= 95
          ? "le jeu de données est très largement conforme ; les dépassements sont rares et isolés"
          : r >= 80
            ? "le jeu de données est majoritairement conforme, mais des dépassements existent et méritent attention"
            : r >= 50
              ? "une part importante des mesures dépasse les limites, ce qui traduit une situation préoccupante"
              : "plus de la moitié des mesures comparées dépasse les limites, ce qui traduit une situation dégradée";
    out.push({
      text:
        k.over === 0
          ? `Toutes les mesures comparées (${withNorm}) respectent les limites : le taux de conformité global est de 100${NB}% et aucun dépassement n'est observé.`
          : `Le taux de conformité global est de ${pct(r)} (${k.ok} mesures conformes sur ${withNorm} comparées) : ${verdict}.`,
    });
  }

  const stats = elementStats(d);
  const over = d.conf.filter((c) => c.status === "Dépassement");
  if (over.length) {
    const byEl = stats.filter((s) => s.over.length).sort((a, b) => b.over.length - a.over.length);
    const top = byEl.slice(0, 3);
    const share = (100 * top.reduce((a, s) => a + s.over.length, 0)) / over.length;
    out.push({
      text: `Les ${over.length} ${pl(over.length, "dépassement")} concernent ${byEl.length} ${pl(byEl.length, "élément")}. ${byEl.length > top.length ? `Les plus fréquents sont ${list(top.map((s) => `${s.element} (${s.over.length})`))}, qui représentent ${pct(share, 0)} des dépassements.` : `Répartition : ${list(top.map((s) => `${s.element} (${s.over.length})`))}.`}`,
    });
    const byStation = new Map<string, { n: number; els: Set<string>; max: number }>();
    for (const c of over) {
      const e = byStation.get(c.station) ?? { n: 0, els: new Set<string>(), max: 0 };
      e.n++;
      e.els.add(c.element);
      e.max = Math.max(e.max, c.ratio ?? 0);
      byStation.set(c.station, e);
    }
    const [ws, wv] = [...byStation.entries()].sort((a, b) => b[1].n - a[1].n || b[1].max - a[1].max)[0]!;
    const worst = over.reduce((b, c) => ((c.ratio ?? 0) > (b.ratio ?? 0) ? c : b), over[0]!);
    const high = over.filter((c) => (c.ratio ?? 0) > 2).length;
    out.push({
      text: `La station la plus touchée est ${ws} (${wv.n} ${pl(wv.n, "dépassement")}, ${wv.els.size} ${pl(wv.els.size, "élément")} concerné${wv.els.size > 1 ? "s" : ""}). Le dépassement le plus marqué est celui de ${worst.element} à ${worst.station}${dateOf(worst)} : ${fr(worst.concentration, 3)} ${worst.unite} pour une limite de ${fr(worst.limit, 3)} ${worst.limitUnit}, soit ${fr(worst.ratio, 1)} fois la limite.${high ? ` Parmi les dépassements, ${high} ${pl(high, "dépasse", "dépassent")} plus de deux fois la limite.` : " Aucun dépassement n'atteint le double de la limite."}`,
    });
  }

  const pli = d.stations.filter((s) => Number.isFinite(s.pli));
  if (pli.length) {
    const nPli = pli.filter((s) => s.pli > 1).length;
    const worstRi = [...d.stations].filter((s) => Number.isFinite(s.ri)).sort((a, b) => b.ri - a.ri)[0];
    out.push({
      text: `Selon les indices de pollution, ${nPli === 0 ? "aucune station ne présente de détérioration globale (PLI ≤ 1)" : `${nPli} ${pl(nPli, "station")} sur ${pli.length} ${pl(nPli, "présente", "présentent")} un indice de charge polluante supérieur à 1, signe d'une détérioration globale du site`}.${worstRi ? ` Le risque écologique potentiel est le plus élevé à ${worstRi.station} (RI = ${fr(worstRi.ri, 1)}, ${lc(interp.ri(worstRi.ri).label)}).` : ""}`,
    });
  }
  return out;
}

/* ---------- Bloc 2 : conformité ---------- */
export function interpretConformity(d: ReportInput): Item[] {
  const out: Item[] = [
    { text: "Le ratio C/L rapporte la concentration mesurée à la limite du référentiel : une valeur supérieure à 1 est un dépassement. Un ratio compris entre 1 et 2 est qualifié de dépassement modéré, au-delà de 2 de dépassement élevé (convention de l'application, identique aux couleurs des tableaux)." },
  ];
  const nStations = d.kpi.stations;
  const all = elementStats(d);
  const persistent = all.filter((s) => s.persistence === "persistante").map((s) => s.element);
  const variable = all.filter((s) => s.persistence === "variable").map((s) => s.element);
  if (persistent.length) out.push({ text: `Évolution entre campagnes : pour ${list(persistent)}, les dépassements se répètent à chaque campagne aux stations concernées, ce qui oriente vers une présence persistante plutôt qu'un épisode ponctuel.` });
  if (variable.length) out.push({ text: `Évolution entre campagnes : pour ${list(variable)}, les dépassements n'apparaissent que lors de certaines campagnes aux stations concernées ; il peut s'agir d'épisodes ponctuels ou de variations saisonnières.` });
  for (const s of all) {
    if (!s.rated.length) {
      out.push({ title: s.element, text: "aucune limite n'est disponible dans ce référentiel : la conformité ne peut pas être évaluée." });
      continue;
    }
    const m = s.maxRow!;
    const lim = `${fr(m.limit, 3)} ${m.limitUnit}${m.period && m.period !== "—" ? ` (${m.period})` : ""}`;
    if (!s.over.length) {
      out.push({ title: s.element, text: `les ${s.rated.length} ${pl(s.rated.length, "mesure")} respectent la limite de ${lim}. La concentration la plus élevée (${fr(m.concentration, 3)} ${m.unite}, ${m.station}${dateComma(m)}) atteint ${pct(100 * (m.ratio ?? 0), 0)} de la limite.` });
      continue;
    }
    let t = `${s.over.length} ${pl(s.over.length, "dépassement")} sur ${s.rated.length} ${pl(s.rated.length, "mesure")} (${pct((100 * s.over.length) / s.rated.length)}), pour une limite de ${lim}. Le ratio maximal est de ${fr(m.ratio, 2)} à ${m.station}${dateOf(m)}${s.high ? `, avec ${s.high} ${pl(s.high, "valeur dépassant", "valeurs dépassant")} plus de deux fois la limite` : ""}.`;
    const k = s.stationsOver.length;
    if (k === 1) t += ` Le problème est localisé à une seule station (${s.stationsOver[0]}).`;
    else if (k >= nStations / 2) t += ` Le dépassement est généralisé : ${k} stations sur ${s.stationsRated}.`;
    else t += ` Il touche ${k} stations sur ${s.stationsRated} (${list(s.stationsOver.slice(0, 4))}${k > 4 ? "…" : ""}).`;
    out.push({ title: s.element, text: t });
  }
  return out;
}

/* ---------- Bloc 3 : indices de pollution ---------- */
export function interpretIndices(d: ReportInput): Item[] {
  const out: Item[] = [
    { text: "Les indices sont calculés à partir de la concentration moyenne de chaque élément à chaque station, rapportée à sa valeur de référence (voir « Limites et précautions »). FC et PI : rapport à la référence ; Igeo (Müller) : échelle logarithmique ; Er et RI (Hakanson) : risque écologique pondéré par la toxicité ; PLI (Tomlinson) et degré de contamination Cd (Hakanson) : cumul sur tous les éléments ; Nemerow : indice qui accentue le poids de l'élément le plus élevé." },
  ];
  const sts = [...d.stations].filter((s) => Number.isFinite(s.ri) || Number.isFinite(s.pli));
  if (!sts.length) return out;

  // Répartition des stations selon le RI
  const levels = new Map<string, { level: number; n: number }>();
  for (const s of sts) {
    const i = interp.ri(s.ri);
    const e = levels.get(i.label) ?? { level: i.level, n: 0 };
    e.n++;
    levels.set(i.label, e);
  }
  out.push({ text: `Répartition des ${sts.length} stations selon le risque écologique potentiel (RI) : ${list([...levels.entries()].sort((a, b) => a[1].level - b[1].level).map(([l, v]) => `${v.n} en ${lc(l)}`))}.` });

  // Éléments les plus enrichis à l'échelle du site
  const fcByEl = d.elements
    .map((el) => {
      const v = d.idx.filter((r) => r.element === el && Number.isFinite(r.fc)).map((r) => r.fc);
      return { el, mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN };
    })
    .filter((x) => Number.isFinite(x.mean))
    .sort((a, b) => b.mean - a.mean);
  const enriched = fcByEl.filter((x) => x.mean >= 1).slice(0, 3);
  out.push({
    text: enriched.length
      ? `À l'échelle du site, ${enriched.length > 1 ? "les éléments les plus enrichis par rapport à leur référence sont" : "l'élément le plus enrichi par rapport à sa référence est"} ${list(enriched.map((x) => `${x.el} (FC moyen = ${fr(x.mean, 1)})`))}.`
      : "À l'échelle du site, aucun élément n'est globalement enrichi par rapport à sa valeur de référence (FC moyen inférieur à 1 pour tous les éléments).",
  });

  // Stations les plus affectées (détail)
  const ranked = [...sts].sort((a, b) => (Number.isFinite(b.ri) ? b.ri : -1) - (Number.isFinite(a.ri) ? a.ri : -1));
  const N = 5;
  for (const s of ranked.slice(0, N)) {
    const rows = d.idx.filter((r) => r.station === s.station && Number.isFinite(r.fc));
    const topFc = rows.reduce<IndexRow | null>((b, r) => (!b || r.fc > b.fc ? r : b), null);
    const erRows = rows.filter((r) => r.er != null);
    const topEr = erRows.reduce<IndexRow | null>((b, r) => (!b || (r.er ?? 0) > (b.er ?? 0) ? r : b), null);
    const sumEr = erRows.reduce((a, r) => a + (r.er ?? 0), 0);
    let t = `PLI = ${fr(s.pli)} (${lc(interp.pli(s.pli).label)}) ; degré de contamination Cd = ${fr(s.cd, 1)} (${lc(interp.cd(s.cd).label).replace(/^degré /, "")}) ; RI = ${fr(s.ri, 1)} (${lc(interp.ri(s.ri).label)}) ; indice de Nemerow = ${fr(s.nemerow)} (${lc(interp.nemerow(s.nemerow).label)}).`;
    if (topFc) t += ` Élément le plus enrichi : ${topFc.element}${nm(topFc.element)}, avec FC = ${fr(topFc.fc, 1)} (${lc(interp.fc(topFc.fc).label)}) et Igeo = ${fr(topFc.igeo, 1)} (${lc(interp.igeo(topFc.igeo).label)}).`;
    if (topEr && topEr.er != null && sumEr > 0) {
      const share = pct((100 * topEr.er) / sumEr, 0);
      t += topFc && topEr.element === topFc.element ? ` Cet élément contribue aussi le plus au risque écologique (Er = ${fr(topEr.er, 1)}, soit ${share} du RI).` : ` Contribution principale au risque écologique : ${topEr.element}${nm(topEr.element)}, avec Er = ${fr(topEr.er, 1)} (${share} du RI).`;
    }
    out.push({ title: s.station, text: t });
  }
  if (ranked.length > N) out.push({ text: `Les ${ranked.length - N} autres stations ont un risque écologique potentiel inférieur (RI ≤ ${fr(ranked[N]!.ri, 1)}) ; leurs indices détaillés figurent dans le tableau ci-dessus.` });
  return out;
}

/* ---------- Bloc 4 : interpolation spatiale ---------- */
export function interpretSpatial(o: {
  label: string;
  points: SPoint[];
  idw?: { power: number; cv: CVResult } | undefined;
  krig?: { model: VModel; fit: Fit; cv: CVResult } | undefined;
  std?: boolean | undefined;
}): string[] {
  const out: string[] = [];
  const pts = o.points.filter((p) => Number.isFinite(p.value));
  const n = pts.length;
  if (!n) return out;
  const sorted = [...pts].sort((a, b) => b.value - a.value);
  const mean = pts.reduce((a, p) => a + p.value, 0) / n;
  const hi = sorted[0]!;
  const lo = sorted[n - 1]!;
  out.push(`La variable « ${o.label} » varie de ${fr(lo.value, 3)} (${lo.station}) à ${fr(hi.value, 3)} (${hi.station}) sur ${n} stations, pour une moyenne de ${fr(mean, 3)}.`);

  // Localisation des valeurs les plus élevées par rapport au centre de la zone (plan local km)
  const proj = projector(pts);
  const xy = pts.map((p) => ({ p, ...proj(p.lat, p.lon) }));
  const radius = Math.max(...xy.map((q) => Math.hypot(q.x, q.y)), 1e-9);
  const where = (name: string) => {
    const q = xy.find((z) => z.p.station === name)!;
    return Math.hypot(q.x, q.y) < 0.15 * radius ? "au centre de la zone" : `dans le secteur ${sector(q.x, q.y)}`;
  };
  const top = sorted.slice(0, Math.min(3, n));
  if (hi.value > lo.value)
    out.push(`Les valeurs les plus élevées sont observées à ${list(top.map((p) => `${p.station} (${where(p.station)}, ${fr(p.value, 3)})`))} (secteurs définis par rapport au centre géométrique des stations).`);

  const skillWord = (s: number) => (s >= 0.5 ? "bonne" : s >= 0.2 ? "modeste" : s > 0 ? "faible" : "nulle");
  const cvText = (name: string, cv: CVResult) =>
    `${name} : la validation croisée (leave-one-out) donne un RMSE de ${fr(cv.rmse, 3)}, soit un gain de ${pct(cv.skill * 100, 0)} par rapport à la simple moyenne des stations (capacité de prédiction ${skillWord(cv.skill)}).${cv.skill <= 0 ? " L'interpolation ne fait pas mieux que la moyenne : les surfaces doivent être lues comme une simple illustration." : ""}`;
  if (o.idw) out.push(cvText(`IDW (puissance optimale p = ${fr(o.idw.power, 1)})`, o.idw.cv));

  if (o.krig) {
    const { fit, cv } = o.krig;
    const nug = pct(fit.nugRatio * 100, 0);
    const range = fr(fit.params.range, 1);
    const s = fit.structure;
    if (s === "indéterminée") out.push("Krigeage : le nombre de paires de stations est trop faible pour ajuster un variogramme fiable.");
    else if (s === "aucune")
      out.push(`Krigeage : aucune structure spatiale exploitable n'est détectée (pépite = ${nug} du palier) : la variabilité ne dépend pas de la position des stations, et la surface retombe sur la moyenne loin des points de mesure.`);
    else {
      const strength = s === "forte" ? "forte" : s === "modérée" ? "modérée" : "faible";
      out.push(`Krigeage : le variogramme révèle une structure spatiale ${strength} (pépite = ${nug} du palier).${s === "faible" ? " L'essentiel de la variabilité est indépendant de la position, ce qui limite l'apport du krigeage." : ""} ${fit.params.range > fit.cutoff ? `La portée ajustée (${range} km) dépasse la moitié de l'étendue de la zone : elle est mal contrainte par les données.` : `La portée de ${range} km est la distance au-delà de laquelle deux stations ne sont plus corrélées.`}`);
    }
    out.push(cvText("Krigeage", cv));
    if (cv.msdr != null && cv.msdr > 1.5) out.push("La variance de krigeage sous-estime l'erreur réelle observée en validation croisée : l'écart-type de krigeage est à lire avec prudence.");
    else if (cv.msdr != null && cv.msdr < 0.5) out.push("La variance de krigeage surestime l'erreur réelle observée en validation croisée : l'incertitude affichée est probablement prudente.");
  }

  if (o.idw && o.krig) {
    const a = o.idw.cv.rmse;
    const b = o.krig.cv.rmse;
    if (Math.abs(a - b) < 0.05 * Math.max(a, b)) out.push(`Les deux méthodes donnent des erreurs comparables (RMSE ${fr(a, 3)} pour l'IDW, ${fr(b, 3)} pour le krigeage).`);
    else out.push(`${b < a ? "Le krigeage" : "L'IDW"} donne la plus faible erreur de validation croisée (RMSE ${fr(Math.min(a, b), 3)} contre ${fr(Math.max(a, b), 3)}).`);
  }
  if (o.std) out.push("La carte d'incertitude montre que l'écart-type de krigeage augmente avec l'éloignement des stations : les zones éloignées des points de mesure sont à interpréter avec prudence.");
  if (n < 20) out.push(`Avec seulement ${n} stations, les statistiques spatiales (variogramme, validation croisée) reposent sur peu de données : on recommande en général 30 à 50 points. Les résultats sont indicatifs.`);
  return out;
}

/* ---------- Bloc 5 : limites et précautions ---------- */
export function interpretLimits(d: ReportInput): Item[] {
  const out: Item[] = [];
  const nS = d.kpi.stations;
  if (nS < 10) out.push({ text: `Le nombre de stations (${nS}) est limité : les statistiques et les interpolations sont à considérer comme indicatives.` });
  const dates = [...new Set(d.rows.map((r) => r.date).filter(Boolean))].sort();
  if (dates.length <= 1) out.push({ text: `${dates.length === 1 ? "Une seule date de prélèvement est disponible" : "Aucune date de prélèvement n'est renseignée"} : l'évolution dans le temps et la variabilité saisonnière ne peuvent pas être évaluées.` });
  else out.push({ text: `Les mesures couvrent ${dates.length} dates de prélèvement (du ${dates[0]} au ${dates[dates.length - 1]}) ; les indices de pollution utilisent la concentration moyenne par station et par élément, ce qui lisse les variations entre campagnes.` });

  const noNorm = d.elements.filter((el) => !d.conf.some((c) => c.element === el && c.status !== "Norme non disponible"));
  if (noNorm.length) out.push({ text: `Aucune limite n'existe dans le référentiel retenu pour ${list(noNorm)} : ${noNorm.length > 1 ? "ces éléments sont exclus" : "cet élément est exclu"} du taux de conformité.` });
  const unitIssue = d.conf.filter((c) => c.limit != null && c.ratio == null).length;
  if (unitIssue) out.push({ text: `${unitIssue} ${pl(unitIssue, "mesure")} ${pl(unitIssue, "n'a pas pu être comparée", "n'ont pas pu être comparées")} à ${unitIssue > 1 ? "leur" : "sa"} limite en raison d'unités incompatibles.` });

  // Valeurs de référence des indices
  const matrix = d.matrix as Matrix;
  const refs = d.elements.map((el) => ({ el, row: d.idx.find((r) => r.element === el), lim: d.conf.find((c) => c.element === el && c.limit != null) })).filter((x) => x.row);
  if (refs.length) {
    const base = BASE_UNIT[matrix] ?? "";
    out.push({ text: `Les indices FC, PI, Igeo et Er dépendent de la valeur de référence adoptée pour chaque élément (${refs.map((x) => `${x.el} : ${fr(x.row!.ref, 3)}`).join(" ; ")}${base ? ` ${base}` : ""}).` });
    const asLimit = refs
      .filter((x) => x.lim && base && (convert(x.lim.limit!, x.lim.limitUnit, base) ?? NaN) > 0 && Math.abs((convert(x.lim.limit!, x.lim.limitUnit, base) ?? NaN) - x.row!.ref) <= 1e-9 * x.row!.ref)
      .map((x) => x.el);
    const crust = refs.filter((x) => matrix !== "Sol" && !x.lim && CRUST_BACKGROUND[x.el] === x.row!.ref).map((x) => x.el);
    if (crust.length) out.push({ text: `Pour ${list(crust)}, aucune limite n'existe dans le référentiel et la référence est une valeur de fond de croûte terrestre établie pour les sols : elle est peu adaptée à cette matrice, et les indices de ${crust.length > 1 ? "ces éléments" : "cet élément"} sont à interpréter avec une grande prudence.` });
    if (asLimit.length) out.push({ text: `Pour ${list(asLimit)}, la référence est la limite réglementaire et non un fond géochimique : les indices expriment alors un rapport à cette limite plutôt qu'un enrichissement par rapport au bruit de fond naturel.` });
  }
  out.push({ text: `Les limites de détection analytiques ne sont pas prises en compte dans les calculs${d.matrix === "Sol" ? ", et les concentrations mesurées ne sont pas normalisées par la granulométrie ou la teneur en matière organique" : ""}.` });
  out.push({ text: "Les interprétations de ce rapport sont générées automatiquement à partir de règles fixes appliquées aux résultats et de seuils issus de la littérature. Elles décrivent les données observées et n'établissent aucun lien de causalité avec des sources de pollution : elles ne remplacent pas l'avis d'un spécialiste." });
  return out;
}
