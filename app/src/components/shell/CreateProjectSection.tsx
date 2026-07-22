import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Self-contained so any dashboard can drop it in, gated by the
// can_create_projects flag — previously project creation only existed on
// the CEO dashboard with no way to delegate it independently of task
// assignment.
export function CreateProjectSection() {
  const queryClient = useQueryClient();

  const createProject = useMutation({
    mutationFn: async (input: { name: string; clientName: string; contractValue: number }) => {
      const { error } = await supabase.from("projects").insert({
        name: input.name,
        client_name: input.clientName,
        contract_value: input.contractValue,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Every dashboard's project dropdown shares these query keys, so this
      // single invalidate refreshes every "select project" picker instantly.
      queryClient.invalidateQueries({ queryKey: ["projects-active"] });
      queryClient.invalidateQueries({ queryKey: ["projects-all"] });
      queryClient.invalidateQueries({ queryKey: ["historical-projects"] });
    },
  });

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">New project</h2>
      <NewProjectForm onCreate={(input) => createProject.mutate(input)} />
    </section>
  );
}

function NewProjectForm({
  onCreate,
}: {
  onCreate: (input: { name: string; clientName: string; contractValue: number }) => void;
}) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [contractValue, setContractValue] = useState("");

  function submit() {
    if (!name || !clientName) return;
    onCreate({ name, clientName, contractValue: Number(contractValue || 0) });
    setName("");
    setClientName("");
    setContractValue("");
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <Field label="Project name">
        <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Acme Website Revamp" />
      </Field>
      <Field label="Client">
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} className="input" placeholder="e.g. Acme Corp" />
      </Field>
      <Field label="Contract value">
        <input
          type="number"
          min="0"
          value={contractValue}
          onChange={(e) => setContractValue(e.target.value)}
          className="input w-32"
          placeholder="0"
        />
      </Field>
      <button onClick={submit} className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm text-[var(--color-accent-fg)]">
        Create project
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">
      {label}
      {children}
    </label>
  );
}
