import { initials } from "@/lib/format";
import { logout, toggleTaskDone } from "./actions";
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
    <main className="max-w-md mx-auto my-10 border border-stone-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-6 py-4 text-white" style={{ backgroundColor: accentColor }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-serif text-sm">
            {initials(establishment.name)}
          </div>
          <div>
            <p className="font-serif text-sm leading-tight">{establishment.name}</p>
            <p className="text-xs text-white/70 leading-tight">{staffName}</p>
          </div>
        </div>
        <form action={logout.bind(null, slug)}>
          <button type="submit" className="text-xs text-white/80 hover:text-white underline">
            Se déconnecter
          </button>
        </form>
      </div>

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
    </main>
  );
}
