import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Sparkles } from "lucide-react";
import { useStore } from "../lib/store";
import { REGION_MAP } from "../lib/geo";
import { fmtDate, fmtHa } from "../lib/format";
import { ActionBadge, ScoreChip, Skeleton } from "../components/ui";
import { bandColor } from "../lib/scoring";

interface AiMemo {
  summary: string; thesis: string; upside: string[]; risks: string[];
  geology: string; valuation: string; recommendation: string; nextStep: string;
  confidence: number; provider: string;
}

export function MemoGenerator() {
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const TENEMENTS = useStore((s) => s.tenements);
  const [q, setQ] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiMemo, setAiMemo] = useState<AiMemo | null>(null);

  const subject = (selectedId ? TENEMENTS.find((t) => t.id === selectedId) : undefined) ?? TENEMENTS[0];

  useEffect(() => {
    if (!selectedId && TENEMENTS[0]) select(TENEMENTS[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [TENEMENTS]);

  // pull an LLM-written memo when an AI key is configured
  useEffect(() => {
    setAiMemo(null);
    if (!subject) return;
    let cancelled = false;
    fetch("/api/memo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subject) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && d.provider) setAiMemo(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [subject?.id]);

  const regenerate = (id: string) => {
    select(id);
    setGenerating(true);
    setTimeout(() => setGenerating(false), 650);
  };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return TENEMENTS.filter((t) => !s || `${t.id} ${t.holder} ${t.commodities.join(" ")}`.toLowerCase().includes(s)).slice(0, 40);
  }, [q, TENEMENTS]);

  const realExpiry = new Date(subject.expiryDate).getFullYear() > 1971;
  const recTone =
    subject.action === "Acquire" ? "var(--score-high)" : subject.action === "Avoid" ? "var(--score-low)" : "var(--score-mid)";

  return (
    <div className="page-scroll">
      <div className="page-head">
        <div>
          <h1>IC Memo Generator</h1>
          <div className="sub">One-click investment committee memo · auto-drafted from the Haxax record</div>
        </div>
        <div className="page-head-actions">
          <button className="btn" onClick={() => window.print()}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn--primary" onClick={() => regenerate(subject.id)}>
            <Sparkles size={14} /> Regenerate
          </button>
        </div>
      </div>

      <div className="page-body" style={{ height: "calc(100% - 0px)" }}>
        <div className="memo-layout">
          {/* picker */}
          <div className="card" style={{ alignSelf: "start" }}>
            <div className="card-head"><span className="card-title">Select tenement</span></div>
            <div className="card-body" style={{ padding: "var(--sp-3)" }}>
              <input className="input" placeholder="Search tenements…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: "var(--sp-2)" }} />
              <div className="col" style={{ gap: 2, maxHeight: 460, overflowY: "auto" }}>
                {list.map((t) => (
                  <button
                    key={t.id}
                    className="list-row"
                    style={{
                      borderRadius: "var(--r-sm)",
                      padding: "7px 8px",
                      border: "1px solid",
                      borderColor: t.id === subject.id ? "var(--accent-line)" : "transparent",
                      background: t.id === subject.id ? "var(--bg-selected)" : "transparent",
                    }}
                    onClick={() => regenerate(t.id)}
                  >
                    <ScoreChip score={t.score} size="sm" />
                    <div className="lr-main">
                      <div className="lr-id">{t.id}</div>
                      <div className="lr-sub">{t.commodities[0]} · {REGION_MAP[t.regionId].name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* memo paper */}
          <div className="scroll-y" style={{ minHeight: 0 }}>
            {generating ? <MemoSkeleton /> : (
              <div className="memo-paper fade-in" id="memo-paper">
                <div className="memo-inner">
                  <div className="memo-letterhead">
                    <div className="row center gap-2">
                      <FileText size={18} style={{ color: "var(--accent)" }} />
                      <div>
                        <div className="memo-h1" style={{ fontSize: "var(--fs-16)" }}>HAXAX</div>
                        <div className="ml-title">Investment Committee Memorandum</div>
                      </div>
                    </div>
                    <div className="text-right col" style={{ alignItems: "flex-end", gap: 3 }}>
                      {aiMemo && <span className="ai-provider">⬡ {aiMemo.provider}</span>}
                      <div className="ml-title">Confidential — Draft</div>
                      <div className="mono faint" style={{ fontSize: "var(--fs-11)" }}>{fmtDate(new Date().toISOString())}</div>
                    </div>
                  </div>

                  <div className="row between center wrap gap-3">
                    <div>
                      <div className="memo-h1 mono">{subject.id}</div>
                      <div className="muted">{subject.holder} · {subject.licenceType} licence · {REGION_MAP[subject.regionId].name}</div>
                    </div>
                    <div className="row center gap-2">
                      <ScoreChip score={subject.score} size="lg" />
                      <ActionBadge action={subject.action} />
                    </div>
                  </div>

                  <div className="memo-meta-grid">
                    <MetaCell k="Tenement" v={subject.id} />
                    <MetaCell k="District" v={subject.district} />
                    <MetaCell k="Area" v={fmtHa(subject.areaHa)} />
                    <MetaCell k="Granted" v={fmtDate(subject.grantDate)} />
                    <MetaCell k="Expiry" v={realExpiry ? fmtDate(subject.expiryDate) : "Not on register"} />
                    <MetaCell k="Ownership" v={subject.ownershipComplexity} />
                    <MetaCell k="Haxax indicator" v={`${subject.score}/100`} color={bandColor(subject.score)} />
                    <MetaCell k="Confidence" v={`${subject.ai.confidence}%`} />
                  </div>

                  <div className="memo-section">
                    <h3>1 · Summary</h3>
                    <p>
                      {aiMemo ? aiMemo.summary : (
                        <>{subject.id} is a {subject.areaHa.toLocaleString()}-ha {subject.licenceType.toLowerCase()} licence held by {subject.holder} in the {REGION_MAP[subject.regionId].name}, prospective for {subject.commodities.map((c) => c.toLowerCase()).join(" and ")}. It carries a Haxax Score of {subject.score}/100 and is classified <strong style={{ color: recTone }}>{subject.action}</strong>.</>
                      )}
                    </p>
                  </div>

                  <div className="memo-section">
                    <h3>2 · Investment thesis</h3>
                    <p>{aiMemo?.thesis ?? subject.ai.thesis}</p>
                    <ul style={{ marginTop: "var(--sp-2)" }}>
                      {(aiMemo?.upside ?? subject.ai.upside).map((u, i) => <li key={i}>{u}</li>)}
                    </ul>
                  </div>

                  <div className="memo-section">
                    <h3>3 · Key risks</h3>
                    <ul>
                      {(aiMemo?.risks ?? subject.ai.risks).map((r, i) => <li key={i}>{r}</li>)}
                      {subject.riskFlags.map((r, i) => <li key={`f${i}`}>{r.label} ({r.level})</li>)}
                    </ul>
                  </div>

                  <div className="memo-section">
                    <h3>4 · Endowment &amp; geology</h3>
                    <p>{aiMemo?.geology ?? `${subject.endowment} recorded MINEDEX deposit${subject.endowment === 1 ? "" : "s"} lie within 25 km${subject.nearbyMines[0] ? ` (nearest ${subject.nearbyMines[0].name} at ${subject.nearbyMines[0].distanceKm} km)` : ""}, with ${subject.drillHolesNearby} DMIRS drill collars logged within 10 km. Bedrock geology and native-title status for this exact ground are resolved live from GSWA and NNTT layers in the detail panel.`}</p>
                  </div>

                  <div className="memo-section">
                    <h3>5 · Nearby project context (MINEDEX)</h3>
                    {subject.nearbyMines.length ? (
                      <ul>
                        {subject.nearbyMines.map((m, i) => (
                          <li key={i}>{m.name} ({m.commodity}) — {m.distanceKm} km, {m.status.toLowerCase()}</li>
                        ))}
                      </ul>
                    ) : <p>No MINEDEX deposit recorded within 120 km.</p>}
                  </div>

                  <div className="memo-section">
                    <h3>6 · Valuation note</h3>
                    <p>
                      {aiMemo?.valuation ? aiMemo.valuation + " " : ""}
                      The public DMIRS register carries <strong>no sale price, rent, royalty, resource or valuation</strong> for this tenement, so no dollar figure is stated here. What bears on value is the real endowment nearby ({subject.endowment} deposits ≤25 km), the {subject.drillHolesNearby} drill collars ≤10 km, the {fmtHa(subject.areaHa)} of ground, holder profile ({subject.holderType}){realExpiry ? ", and expiry timing" : ""}. A defensible valuation requires primary data — comparable transactions, a JORC resource and exploration results — not on the public record.
                    </p>
                  </div>

                  <div className="memo-section">
                    <h3>7 · Recommendation</h3>
                    <div className="memo-rec" style={{ borderColor: recTone, background: `color-mix(in srgb, ${recTone} 8%, transparent)` }}>
                      <div>
                        <div style={{ fontWeight: 700, color: recTone, fontSize: "var(--fs-16)" }}>{subject.action} · {aiMemo?.recommendation ?? subject.ai.verdict}</div>
                        <div className="muted" style={{ fontSize: "var(--fs-12)", marginTop: 2 }}>{aiMemo?.nextStep ?? subject.ai.nextStep}</div>
                      </div>
                      <ActionBadge action={subject.action} />
                    </div>
                  </div>

                  <div className="faint" style={{ fontSize: "var(--fs-10)", borderTop: "1px solid var(--border)", paddingTop: "var(--sp-3)" }}>
                    Generated by Haxax · sourced from the live DMIRS / SLIP tenement register. Decision-support only — not a valuation or financial advice.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaCell({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="kv">
      <span className="kv-key">{k}</span>
      <span className="kv-val mono" style={color ? { color } : undefined}>{v}</span>
    </div>
  );
}

function MemoSkeleton() {
  return (
    <div className="memo-paper">
      <div className="memo-inner col gap-3">
        <Skeleton w="40%" h={22} />
        <Skeleton w="70%" h={14} />
        <Skeleton w="100%" h={70} r={8} />
        <Skeleton w="30%" h={16} />
        <Skeleton w="100%" h={48} />
        <Skeleton w="90%" h={48} />
        <Skeleton w="30%" h={16} />
        <Skeleton w="100%" h={60} />
      </div>
    </div>
  );
}
