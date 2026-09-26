import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/etm/ui";
import { REFERENCES } from "@/lib/etm/references";
import { pageHead } from "@/lib/etm/head";

export const Route = createFileRoute("/references")({
  head: pageHead("Références scientifiques", "Bibliographie des indices géochimiques, méthodes d'interpolation et normes utilisées."),
  component: () => (
    <div className="space-y-6">
      <PageHeader title="Références scientifiques" desc="Sources des formules, classes d'interprétation et référentiels normatifs utilisés." />
      <Panel>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          {REFERENCES.map((r) => <li key={r}>{r}</li>)}
        </ol>
      </Panel>
    </div>
  ),
});
