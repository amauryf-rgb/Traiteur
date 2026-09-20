import { ProShell, ProPanel } from "@/components/pro/ProShell";
import { toggleTaskDone } from "./actions";
import type { StaffTask } from "@/lib/db/queries";

export function EmployeePlanning({
  slug,
  establishment,
  staffName,
  tasks,
}: {
  slug: string;
  establishment: { name: string; accentColor: string | null };
  staffName: string;
  tasks: StaffTask[];
}) {
  const accentColor = establishment.accentColor ?? "#1a1a1a";
  const pending = tasks.filter((t) => t.status !== "done");
  const mostUrgent = pending[0];

  return (
    <ProShell slug={slug} establishment={establishment} staffName={staffName} isOwner={false} active="planning">
      <div className="max-w-md">
      <ProPanel>
      <p className="px-6 py-3 text-xs text-stone-400 border-b border-stone-200">Mes tâches — aujourd&apos;hui</p>

      <div className="divide-y divide-stone-200">
        {tasks.map((task) => {
          const isMostUrgent = mostUrgent?.id === task.id;
          return (
            <div key={task.id} className="px-6 py-4 flex items-center gap-4">
              <form action={toggleTaskDone.bind(null, slug, task.id, task.status)}>
                <button
                  type="submit"
                  aria-label={task.status === "done" ? "Marquer non terminée" : "Marquer terminée"}
                  className="w-6 h-6 rounded-md border flex items-center justify-center text-xs"
                  style={
                    task.status === "done"
                      ? { backgroundColor: accentColor, borderColor: accentColor, color: "white" }
                      : { borderColor: "#d6d3d1", color: "transparent" }
                  }
                >
                  ✓
                </button>
              </form>
              <div className="flex-1">
                <p className={`text-sm font-medium ${task.status === "done" ? "text-stone-400 line-through" : ""}`}>
                  {task.productName} × {task.quantity}
                </p>
                <p className={`text-xs mt-0.5 ${isMostUrgent && task.status !== "done" ? "text-amber-700 font-medium" : "text-stone-400"}`}>
                  Prêt pour {task.readyByTime.slice(0, 5).replace(":", "h")}
                  {isMostUrgent && task.status !== "done" ? " · à préparer en priorité" : ""}
                </p>
              </div>
            </div>
          );
        })}
        {tasks.length === 0 && <p className="px-6 py-8 text-center text-stone-400 text-sm">Aucune tâche assignée aujourd&apos;hui.</p>}
      </div>
      </ProPanel>
      </div>
    </ProShell>
  );
}
