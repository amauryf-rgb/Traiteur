import { Fragment } from "react";
import { PAPER, PAPER_LINE, INK_MUTED } from "@/lib/theme";

const STEP_TITLES = ["Votre événement", "Vos formules", "Vos coordonnées", "Récapitulatif"];

export function ProgressDots({ step, accentColor }: { step: 1 | 2 | 3 | 4; accentColor: string }) {
  return (
    <div className="pt-8 pb-2">
      <div className="flex items-center justify-center gap-1.5">
        {([1, 2, 3, 4] as const).map((n) => (
          <Fragment key={n}>
            <div
              className="w-[22px] h-[22px] rounded-full border flex items-center justify-center font-serif text-[11px] shrink-0"
              style={
                n < step
                  ? { backgroundColor: accentColor, borderColor: accentColor, color: PAPER }
                  : n === step
                    ? { borderColor: accentColor, color: accentColor, fontWeight: 600 }
                    : { borderColor: PAPER_LINE, color: INK_MUTED }
              }
            >
              {n < step ? "✓" : n}
            </div>
            {n < 4 && <div className="w-5 h-px shrink-0" style={{ backgroundColor: n < step ? accentColor : PAPER_LINE }} />}
          </Fragment>
        ))}
      </div>
      <p className="text-center text-[10.5px] uppercase tracking-wide mt-3" style={{ color: INK_MUTED }}>
        Étape <span style={{ color: accentColor, fontWeight: 600 }}>{step}/4</span> — {STEP_TITLES[step - 1]}
      </p>
    </div>
  );
}
