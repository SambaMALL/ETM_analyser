import type { Col } from "./DataTable";
import { InterpBadge, StatusBadge } from "./ui";
import { downloadCSV, fmt, interp, type ConfRow, type IndexRow, type StationIdx } from "@/lib/etm/analysis";

export const confCols: Col<ConfRow>[] = [
  { key: "st", label: "Station", value: (r) => r.station },
  { key: "d", label: "Date", value: (r) => r.date },
  { key: "el", label: "Élément", value: (r) => r.element },
  { key: "c", label: "Concentration", value: (r) => r.concentration, render: (r) => fmt(r.concentration, 4), num: true },
  { key: "u", label: "Unité", value: (r) => r.unite },
  { key: "l", label: "Limite", value: (r) => r.limit, render: (r) => fmt(r.limit, 4), num: true },
  { key: "lu", label: "Unité limite", value: (r) => r.limitUnit },
  { key: "p", label: "Période", value: (r) => r.period },
  { key: "r", label: "Ratio C/L", value: (r) => r.ratio, render: (r) => fmt(r.ratio, 2), num: true },
  { key: "s", label: "Statut", value: (r) => r.status, render: (r) => <StatusBadge s={r.status} /> },
];

export const idxCols: Col<IndexRow>[] = [
  { key: "st", label: "Station", value: (r) => r.station },
  { key: "el", label: "Élément", value: (r) => r.element },
  { key: "c", label: "C moyenne", value: (r) => r.conc, render: (r) => fmt(r.conc, 4), num: true },
  { key: "ref", label: "Référence", value: (r) => r.ref, render: (r) => fmt(r.ref, 4), num: true },
  { key: "fc", label: "FC", value: (r) => r.fc, render: (r) => fmt(r.fc, 2), num: true },
  { key: "fci", label: "Interprétation FC", value: (r) => interp.fc(r.fc).label, render: (r) => <InterpBadge i={interp.fc(r.fc)} /> },
  { key: "ig", label: "Igeo", value: (r) => r.igeo, render: (r) => fmt(r.igeo, 2), num: true },
  { key: "igi", label: "Interprétation Igeo", value: (r) => interp.igeo(r.igeo).label, render: (r) => <InterpBadge i={interp.igeo(r.igeo)} /> },
  { key: "pi", label: "PI", value: (r) => r.pi, render: (r) => fmt(r.pi, 2), num: true },
  { key: "pii", label: "Interprétation PI", value: (r) => interp.pi(r.pi).label, render: (r) => <InterpBadge i={interp.pi(r.pi)} /> },
  { key: "tf", label: "Tr", value: (r) => r.tf, num: true },
  { key: "er", label: "Er", value: (r) => r.er, render: (r) => fmt(r.er, 1), num: true },
  { key: "eri", label: "Interprétation Er", value: (r) => (r.er == null ? "—" : interp.er(r.er).label), render: (r) => (r.er == null ? "—" : <InterpBadge i={interp.er(r.er)} />) },
];

export const stationCols: Col<StationIdx>[] = [
  { key: "st", label: "Station", value: (r) => r.station },
  { key: "n", label: "Nb él.", value: (r) => r.n, num: true },
  { key: "pli", label: "PLI", value: (r) => r.pli, render: (r) => fmt(r.pli, 2), num: true },
  { key: "plii", label: "Interprétation PLI", value: (r) => interp.pli(r.pli).label, render: (r) => <InterpBadge i={interp.pli(r.pli)} /> },
  { key: "cd", label: "Cd (degré)", value: (r) => r.cd, render: (r) => fmt(r.cd, 2), num: true },
  { key: "cdi", label: "Interprétation Cd", value: (r) => interp.cd(r.cd).label, render: (r) => <InterpBadge i={interp.cd(r.cd)} /> },
  { key: "ri", label: "RI", value: (r) => r.ri, render: (r) => fmt(r.ri, 1), num: true },
  { key: "rii", label: "Interprétation RI", value: (r) => interp.ri(r.ri).label, render: (r) => <InterpBadge i={interp.ri(r.ri)} /> },
  { key: "ne", label: "Nemerow", value: (r) => r.nemerow, render: (r) => fmt(r.nemerow, 2), num: true },
  { key: "nei", label: "Interprétation Nemerow", value: (r) => interp.nemerow(r.nemerow).label, render: (r) => <InterpBadge i={interp.nemerow(r.nemerow)} /> },
];

export function exportCols<T>(name: string, cols: Col<T>[], rows: T[]) {
  downloadCSV(name, cols.map((c) => c.label), rows.map((r) => cols.map((c) => c.value(r))));
}
