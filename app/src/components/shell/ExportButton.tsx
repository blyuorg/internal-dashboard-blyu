import { Download } from "lucide-react";
import { useHasFlag, useAuth } from "@/lib/auth";
import { exportToXlsx } from "@/lib/export";
import type { CapabilityFlag } from "@/lib/database.types";

const FOUNDER_ROLES = new Set(["ceo", "cto", "cfo"]);

export function ExportButton({
  requiresFlag,
  filename,
  rows,
}: {
  requiresFlag: CapabilityFlag;
  filename: string;
  rows: () => Record<string, unknown>[];
}) {
  const { profile } = useAuth();
  const hasFlag = useHasFlag(requiresFlag);
  const allowed = hasFlag || (profile && FOUNDER_ROLES.has(profile.base_role));

  if (!allowed) return null;

  return (
    <button
      onClick={() => exportToXlsx(rows(), filename)}
      className="flex items-center gap-1.5 rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-bg)]"
    >
      <Download size={12} />
      Export
    </button>
  );
}
