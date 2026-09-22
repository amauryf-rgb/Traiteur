import { ProShell, ProPanel } from "@/components/pro/ProShell";
import { toggleTaskDone, togglePrepared } from "./actions";
import type { StaffTask } from "@/lib/db/queries";

function isDone(task: StaffTask): boolean {
  return task.kind === "lot" ? task.status === "done" : task.status === "completed";
}

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
  const pending = tasks.filter((t) => !isDone(t));
  const mostUrgent = pending[0];

  return (
    <ProShell slug={slug} establishment={establishment} staffName={staffName} isOwner={false} active="planning">
      <div className="max-w-md">
      <ProPanel>
      <p className="px-6 py-3 text-xs text-stone-400 border-b border-stone-200">Mes tâches — aujourd&apos;hui</p>

      <div className="divide-y divide-stone-200">
        {tasks.map((task) => {
          const done = isDone(task);
          const isMostUrgent = mostUrgent?.id === task.id && mostUrgent?.kind === task.kind;
          const toggleAction =
            task.kind === "lot"
              ? toggleTaskDone.bind(null, slug, task.id, task.status)
              : togglePrepared.bind(null, slug, task.id, task.status);

          return (
            <div key={`${task.kind}-${task.id}`} className="px-6 py-4 flex items-start gap-4">
              <form action={toggleAction} className="mt-0.5">
                <button
                  type="submit"
                  aria-label={done ? "Marquer non terminée" : "Marquer terminée"}
                  className="w-6 h-6 rounded-md border flex items-center justify-center text-xs"
                  style={
                    done
                      ? { backgroundColor: accentColor, borderColor: accentColor, color: "white" }
                      : { borderColor: "#d6d3d1", color: "transparent" }
                  }
                >
                  ✓
                </button>
              </form>
              <div className="flex-1 min-w-0">
                {task.kind === "order" && (
                  <p className="text-[11px] uppercase tracking-wide text-stone-400 mb-0.5">Commande entière</p>
                )}
                <p className={`text-sm font-medium ${done ? "text-stone-400 line-through" : ""}`}>
                  {task.kind === "lot"
                    ? `${task.productName} × ${task.quantity}`
                    : task.items.map((i) => `${i.productName} ×${i.quantity}`).join(", ")}
                </p>
                <p className={`text-xs mt-0.5 ${isMostUrgent && !done ? "text-amber-700 font-medium" : "text-stone-400"}`}>
                  Prêt pour {task.readyByTime.slice(0, 5).replace(":", "h")}
                  {isMostUrgent && !done ? " · à préparer en priorité" : ""}
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
