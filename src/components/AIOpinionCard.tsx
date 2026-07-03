import { Minus, Plus, Target } from "lucide-react";
import type { AIOpinion, Tenement } from "../lib/types";
import { bandColor, confidenceLabel } from "../lib/scoring";
import { ActionBadge, RadialScore } from "./ui";
import { fmtDate } from "../lib/format";

/* Analyst desk note — deliberately not a chat bubble. Fixed-width
   reference header, decision-led, factor-grounded reasons. When an
   LLM-generated opinion is supplied it is shown with a provider tag. */
export function AIOpinionCard({ t, opinion, provider }: { t: Tenement; opinion?: AIOpinion; provider?: string }) {
  const ai = opinion ?? t.ai;
  const ref = `HX-${t.id.replace("/", "-").replace(/\s/g, "")}`;
  return (
    <div className="ai-card">
      <div className="ai-head">
        <div className="ai-head-left">
          <span className="ai-badge">Haxax Research Note</span>
          <span className="mono faint" style={{ fontSize: "var(--fs-10)" }}>{ref}</span>
        </div>
        {provider ? (
          <span className="ai-provider">⬡ {provider}</span>
        ) : (
          <span className="mono faint" style={{ fontSize: "var(--fs-10)" }}>as at {fmtDate(t.lastUpdated)}</span>
        )}
      </div>

      <div className="ai-body">
        <div className="ai-verdict-row">
          <RadialScore score={ai.rating} size={76} label="MODEL" />
          <div className="ai-verdict">
            <div className="ai-verdict-label">{ai.verdict}</div>
            <div className="ai-verdict-sub">
              Model rating {ai.rating}/100 · disposition{" "}
              <span style={{ color: bandColor(ai.rating), fontWeight: 600 }}>
                {ai.rating >= 85 ? "strong" : ai.rating >= 60 ? "watch" : "weak"}
              </span>
            </div>
            <div style={{ marginTop: 8 }} className="row center gap-2">
              <span className="eyebrow">Call</span>
              <ActionBadge action={t.action} />
              <span className="pill pill--neutral">{t.econ.play}</span>
            </div>
          </div>
        </div>

        <div className="ai-cols">
          <div>
            <div className="ai-col-title up"><Plus size={12} /> Supports a bid</div>
            {ai.upside.map((u, i) => (
              <div className="ai-reason" key={i}>
                <Plus size={13} className="ar-mark up" />
                <span>{u}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="ai-col-title risk"><Minus size={12} /> Against a bid</div>
            {ai.risks.map((r, i) => (
              <div className="ai-reason" key={i}>
                <Minus size={13} className="ar-mark risk" />
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ai-thesis">{ai.thesis}</div>

        <div className="ai-footer">
          <div className="ai-confidence">
            <span className="eyebrow">Confidence</span>
            <div className="conf-bar">
              <div className="conf-fill" style={{ width: `${ai.confidence}%` }} />
            </div>
            <span className="mono secondary" style={{ fontSize: "var(--fs-11)" }}>
              {ai.confidence}% · {confidenceLabel(ai.confidence)}
            </span>
          </div>
        </div>

        <div className="ai-next">
          <Target size={15} className="an-icon" />
          <div>
            <span className="eyebrow" style={{ display: "block", marginBottom: 2 }}>Next step</span>
            <span style={{ color: "var(--text-primary)" }}>{ai.nextStep}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
