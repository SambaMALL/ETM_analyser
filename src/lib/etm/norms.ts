export type Matrix = "Eau" | "Sol" | "Air";
export const MATRICES: Matrix[] = ["Eau", "Sol", "Air"];
export const BASE_UNIT: Record<Matrix, string> = { Eau: "mg/L", Sol: "mg/kg", Air: "µg/m³" };

export interface Limit {
  element: string;
  limit: number;
  unit: string;
  period: string;
}
export interface Norm {
  id: string;
  matrix: Matrix;
  name: string;
  source: string;
  limits: Limit[];
}

const L = (element: string, limit: number, unit: string, period: string): Limit => ({
  element,
  limit,
  unit,
  period,
});

export const NORMS: Norm[] = [
  {
    id: "oms-eau",
    matrix: "Eau",
    name: "OMS — Eau de boisson (2022)",
    source: "WHO Guidelines for Drinking-water Quality, 4th ed. incl. 1st & 2nd addenda, 2022",
    limits: [
      L("As", 0.01, "mg/L", "Valeur guide"),
      L("Cd", 0.003, "mg/L", "Valeur guide"),
      L("Cr", 0.05, "mg/L", "Valeur guide"),
      L("Cu", 2, "mg/L", "Valeur guide"),
      L("Pb", 0.01, "mg/L", "Valeur guide"),
      L("Hg", 0.006, "mg/L", "Valeur guide"),
      L("Ni", 0.07, "mg/L", "Valeur guide"),
      L("Mn", 0.08, "mg/L", "Valeur guide"),
      L("Sb", 0.02, "mg/L", "Valeur guide"),
      L("Se", 0.04, "mg/L", "Valeur guide"),
    ],
  },
  {
    id: "ue-eau",
    matrix: "Eau",
    name: "UE — Directive 2020/2184",
    source: "Directive (UE) 2020/2184 relative à la qualité des eaux destinées à la consommation humaine",
    limits: [
      L("As", 0.01, "mg/L", "Valeur paramétrique"),
      L("Cd", 0.005, "mg/L", "Valeur paramétrique"),
      L("Cr", 0.05, "mg/L", "Valeur paramétrique (0,025 dès 2036)"),
      L("Cu", 2, "mg/L", "Valeur paramétrique"),
      L("Pb", 0.01, "mg/L", "Valeur paramétrique (0,005 dès 2036)"),
      L("Hg", 0.001, "mg/L", "Valeur paramétrique"),
      L("Ni", 0.02, "mg/L", "Valeur paramétrique"),
      L("Sb", 0.01, "mg/L", "Valeur paramétrique"),
      L("Se", 0.02, "mg/L", "Valeur paramétrique"),
    ],
  },
  {
    id: "hc-eau",
    matrix: "Eau",
    name: "Canada — Santé Canada, eau potable",
    source: "Santé Canada, Recommandations pour la qualité de l'eau potable au Canada — Tableau sommaire (juillet 2024)",
    limits: [
      L("Sb", 0.006, "mg/L", "CMA"),
      L("As", 0.01, "mg/L", "CMA"),
      L("Ba", 1, "mg/L", "CMA"),
      L("Cd", 0.005, "mg/L", "CMA"),
      L("Cr", 0.05, "mg/L", "CMA (chrome total)"),
      L("Cu", 2, "mg/L", "Objectif esthétique"),
      L("Pb", 0.005, "mg/L", "CMA (depuis 2019)"),
      L("Hg", 0.001, "mg/L", "CMA"),
      L("Mn", 0.12, "mg/L", "CMA (depuis 2019)"),
      L("Se", 0.05, "mg/L", "CMA"),
      L("U", 0.02, "mg/L", "CMA"),
      L("Zn", 5, "mg/L", "Objectif esthétique"),
    ],
  },
  {
    id: "ccme-sol-agri",
    matrix: "Sol",
    name: "CCME — Sols, usage agricole",
    source: "CCME, Recommandations canadiennes pour la qualité des sols : environnement et santé humaine (1999, mise à jour sept. 2007)",
    limits: [
      L("Sb", 20, "mg/kg", "Agricole"),
      L("As", 12, "mg/kg", "Agricole"),
      L("Ba", 750, "mg/kg", "Agricole"),
      L("Be", 4, "mg/kg", "Agricole"),
      L("Cd", 1.4, "mg/kg", "Agricole"),
      L("Cr", 64, "mg/kg", "Agricole (chrome total)"),
      L("Co", 40, "mg/kg", "Agricole"),
      L("Cu", 63, "mg/kg", "Agricole"),
      L("Pb", 70, "mg/kg", "Agricole"),
      L("Hg", 6.6, "mg/kg", "Agricole"),
      L("Mo", 5, "mg/kg", "Agricole"),
      L("Ni", 50, "mg/kg", "Agricole"),
      L("Ag", 20, "mg/kg", "Agricole"),
      L("Se", 1, "mg/kg", "Agricole"),
      L("V", 130, "mg/kg", "Agricole"),
      L("Zn", 200, "mg/kg", "Agricole"),
    ],
  },
  {
    id: "ccme-sol-resid",
    matrix: "Sol",
    name: "CCME — Sols, résidentiel / parc",
    source: "CCME, Recommandations canadiennes pour la qualité des sols : environnement et santé humaine (1999, mise à jour sept. 2007)",
    limits: [
      L("Sb", 20, "mg/kg", "Résidentiel/parc"),
      L("As", 12, "mg/kg", "Résidentiel/parc"),
      L("Ba", 500, "mg/kg", "Résidentiel/parc"),
      L("Be", 4, "mg/kg", "Résidentiel/parc"),
      L("Cd", 10, "mg/kg", "Résidentiel/parc"),
      L("Cr", 64, "mg/kg", "Résidentiel/parc (chrome total)"),
      L("Co", 50, "mg/kg", "Résidentiel/parc"),
      L("Cu", 63, "mg/kg", "Résidentiel/parc"),
      L("Pb", 140, "mg/kg", "Résidentiel/parc"),
      L("Hg", 6.6, "mg/kg", "Résidentiel/parc"),
      L("Mo", 10, "mg/kg", "Résidentiel/parc"),
      L("Ni", 50, "mg/kg", "Résidentiel/parc"),
      L("Ag", 20, "mg/kg", "Résidentiel/parc"),
      L("Se", 1, "mg/kg", "Résidentiel/parc"),
      L("V", 130, "mg/kg", "Résidentiel/parc"),
      L("Zn", 200, "mg/kg", "Résidentiel/parc"),
    ],
  },
  {
    id: "ccme-sol-comm",
    matrix: "Sol",
    name: "CCME — Sols, commercial",
    source: "CCME, Recommandations canadiennes pour la qualité des sols : environnement et santé humaine (1999, mise à jour sept. 2007)",
    limits: [
      L("Sb", 40, "mg/kg", "Commercial"),
      L("As", 12, "mg/kg", "Commercial"),
      L("Ba", 2000, "mg/kg", "Commercial"),
      L("Be", 8, "mg/kg", "Commercial"),
      L("Cd", 22, "mg/kg", "Commercial"),
      L("Cr", 87, "mg/kg", "Commercial (chrome total)"),
      L("Co", 300, "mg/kg", "Commercial"),
      L("Cu", 91, "mg/kg", "Commercial"),
      L("Pb", 260, "mg/kg", "Commercial"),
      L("Hg", 24, "mg/kg", "Commercial"),
      L("Mo", 40, "mg/kg", "Commercial"),
      L("Ni", 50, "mg/kg", "Commercial"),
      L("Ag", 40, "mg/kg", "Commercial"),
      L("Se", 2.9, "mg/kg", "Commercial"),
      L("V", 130, "mg/kg", "Commercial"),
      L("Zn", 360, "mg/kg", "Commercial"),
    ],
  },
  {
    id: "ccme-sol-indus",
    matrix: "Sol",
    name: "CCME — Sols, industriel",
    source: "CCME, Recommandations canadiennes pour la qualité des sols : environnement et santé humaine (1999, mise à jour sept. 2007)",
    limits: [
      L("Sb", 40, "mg/kg", "Industriel"),
      L("As", 12, "mg/kg", "Industriel"),
      L("Ba", 2000, "mg/kg", "Industriel"),
      L("Be", 8, "mg/kg", "Industriel"),
      L("Cd", 22, "mg/kg", "Industriel"),
      L("Cr", 87, "mg/kg", "Industriel (chrome total)"),
      L("Co", 300, "mg/kg", "Industriel"),
      L("Cu", 91, "mg/kg", "Industriel"),
      L("Pb", 600, "mg/kg", "Industriel"),
      L("Hg", 50, "mg/kg", "Industriel"),
      L("Mo", 40, "mg/kg", "Industriel"),
      L("Ni", 50, "mg/kg", "Industriel"),
      L("Ag", 40, "mg/kg", "Industriel"),
      L("Se", 2.9, "mg/kg", "Industriel"),
      L("V", 130, "mg/kg", "Industriel"),
      L("Zn", 360, "mg/kg", "Industriel"),
    ],
  },
  {
    id: "nl-sol",
    matrix: "Sol",
    name: "Pays-Bas — Valeurs d'intervention",
    source: "Dutch Soil Remediation Circular (VROM, 2009/2013), valeurs d'intervention",
    limits: [
      L("As", 76, "mg/kg", "Intervention"),
      L("Cd", 13, "mg/kg", "Intervention"),
      L("Cr", 180, "mg/kg", "Intervention"),
      L("Cu", 190, "mg/kg", "Intervention"),
      L("Pb", 530, "mg/kg", "Intervention"),
      L("Hg", 36, "mg/kg", "Intervention"),
      L("Ni", 100, "mg/kg", "Intervention"),
      L("Zn", 720, "mg/kg", "Intervention"),
      L("Co", 190, "mg/kg", "Intervention"),
    ],
  },
  {
    id: "oms-air",
    matrix: "Air",
    name: "OMS — Qualité de l'air",
    source: "WHO Air Quality Guidelines for Europe, 2nd ed. (2000) ; WHO Global AQG (2021)",
    limits: [
      L("Pb", 0.5, "µg/m³", "Moyenne annuelle"),
      L("Cd", 0.005, "µg/m³", "Moyenne annuelle"),
      L("Hg", 1, "µg/m³", "Moyenne annuelle"),
      L("Mn", 0.15, "µg/m³", "Moyenne annuelle"),
    ],
  },
  {
    id: "ue-air",
    matrix: "Air",
    name: "UE — Directives 2008/50 & 2004/107",
    source: "Directives 2008/50/CE et 2004/107/CE (valeurs limite et cibles, PM10)",
    limits: [
      L("Pb", 0.5, "µg/m³", "Moyenne annuelle"),
      L("As", 0.006, "µg/m³", "Moyenne annuelle"),
      L("Cd", 0.005, "µg/m³", "Moyenne annuelle"),
      L("Ni", 0.02, "µg/m³", "Moyenne annuelle"),
    ],
  },
  {
    id: "on-air",
    matrix: "Air",
    name: "Canada — Ontario, critères de qualité de l'air ambiant (AAQC)",
    source: "Ontario MECP, Ambient Air Quality Criteria (AAQC) ; Règl. de l'Ont. 337 (RRO 1990)",
    limits: [
      L("As", 25, "µg/m³", "Moyenne 24 h (Règl. 337)"),
      L("Cd", 2, "µg/m³", "Moyenne 24 h (Règl. 337)"),
      L("Hg", 2, "µg/m³", "Moyenne 24 h (Règl. 337)"),
      L("Ni", 2, "µg/m³", "Moyenne 24 h (Règl. 337)"),
      L("Pb", 0.5, "µg/m³", "Moyenne annuelle (AAQC)"),
    ],
  },
];

export const normsFor = (m: Matrix) => NORMS.filter((n) => n.matrix === m);

/** Hakanson (1980) toxic-response factors */
export const TOXIC_FACTOR: Record<string, number> = {
  Cr: 2, Cu: 5, Zn: 1, Pb: 5, Cd: 30, As: 10, Hg: 40, Co: 5, Ni: 5, Mn: 1, V: 2,
};

/** Shale average, Turekian & Wedepohl (1961), mg/kg */
export const CRUST_BACKGROUND: Record<string, number> = {
  As: 13, Cd: 0.3, Cr: 90, Cu: 45, Pb: 20, Hg: 0.4, Ni: 68, Zn: 95, Co: 19, Mn: 850, V: 130, Sb: 1.5, Se: 0.6,
};
