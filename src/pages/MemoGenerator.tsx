import { useEffect, useMemo, useState } from "react";
import { Printer, Sparkles } from "lucide-react";
import { useStore } from "../lib/store";
import { REGION_MAP } from "../lib/geo";
import { fmtHa } from "../lib/format";
import { ScoreChip, Skeleton } from "../components/ui";
import { HaxaxMark } from "../components/Logo";

interface AiMemo {
  summary: string; thesis: string; upside: string[]; risks: string[];
  geology: string; valuation: string; recommendation: string; nextStep: string;
  confidence: number; provider: string;
}

const longDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

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
    setTimeout(() => setGenerating(false), 550);
  };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return TENEMENTS.filter((t) => !s || `${t.id} ${t.holder} ${t.commodities.join(" ")}`.toLowerCase().includes(s)).slice(0, 40);
  }, [q, TENEMENTS]);

  if (!subject) return <div className="page-scroll"><div className="page-body">No tenements loaded.</div></div>;

  const today = new Date();
  const realExpiry = new Date(subject.expiryDate).getFullYear() > 1971;
  const recWord = subject.action;
  const recTone =
    subject.action === "Acquire" ? "var(--score-high)" : subject.action === "Avoid" ? "var(--score-low)" : subject.action === "Investigate" ? "var(--info)" : "var(--score-mid)";
  const ref = `HX-IC-${subject.id.replace(/[^0-9A-Za-z]/g, "")}-${today.toISOString().slice(2, 10).replace(/-/g, "")}`;
  const verdict = aiMemo?.recommendation ?? subject.ai.verdict;
  const nextStep = aiMemo?.nextStep ?? subject.ai.nextStep;

  return (
    <div className="page-scroll memo-page">
      <div className="page-head no-print">
        <div>
          <h1>IC Memo</h1>
          <div className="sub">Formal investment-committee memorandum · drafted from the live Haxax record</div>
        </div>
        <div className="page-head-actions">
          <button className="btn" onClick={() => window.print()}>
            <Printer size={14} /> Print / PDF
          </button>
          <button className="btn btn--primary" onClick={() => regenerate(subject.id)}>
            <Sparkles size={14} /> Regenerate
          </button>
        </div>
      </div>

      <div className="page-body memo-body">
        <div className="memo-layout">
          {/* picker (screen only) */}
          <div className="card no-print" style={{ alignSelf: "start" }}>
            <div className="card-head"><span className="card-title">Select tenement</span></div>
            <div className="card-body" style={{ padding: "var(--sp-3)" }}>
              <input className="input" placeholder="Search tenements…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: "var(--sp-2)" }} />
              <div className="col" style={{ gap: 2, maxHeight: 460, overflowY: "auto" }}>
                {list.map((t) => (
                  <button
                    key={t.id}
                    className="list-row"
                    style={{
                      borderRadius: "var(--r-sm)", padding: "7px 8px", border: "1px solid",
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

          {/* the memorandum */}
          <div className="scroll-y memo-scroll" style={{ minHeight: 0 }}>
            {generating ? <MemoSkeleton /> : (
              <article className="memo-doc fade-in" id="memo-paper">
                {/* letterhead */}
                <header className="memo-letterhead">
                  <div className="memo-lh-brand">
                    <HaxaxMark size={22} />
                    <div>
                      <div className="memo-lh-name">HAXAX</div>
                      <div className="memo-lh-desk">Acquisitions Intelligence · Western Australia</div>
                    </div>
                  </div>
                  <div className="memo-lh-class">Strictly Private &amp; Confidential</div>
                </header>

                <div className="memo-doctitle">Investment Committee Memorandum</div>

                {/* memo header block */}
                <div className="memo-header">
                  <Hdr k="To" v="Investment Committee" />
                  <Hdr k="From" v="Haxax Acquisitions Desk" />
                  <Hdr k="Date" v={longDate(today)} />
                  <Hdr k="Re" v={`Tenement ${subject.id} — ${subject.holder}, ${REGION_MAP[subject.regionId].name}`} />
                  <Hdr k="Ref" v={ref} mono />
                  {aiMemo && <Hdr k="Drafting" v={`Narrative by ${aiMemo.provider}; data from the live DMIRS/SLIP register`} />}
                </div>

                {/* recommendation strip */}
                <div className="memo-recline">
                  <span className="memo-recline-k">Recommendation</span>
                  <span className="memo-recline-v" style={{ color: recTone }}>{recWord}</span>
                  <span className="memo-recline-sep">—</span>
                  <span className="memo-recline-verdict">{verdict}</span>
                </div>

                {/* 1 — Executive summary */}
                <MemoSection n="1" title="Executive summary">
                  <p>
                    {aiMemo ? aiMemo.summary : (
                      <>{subject.id} is a {Math.round(subject.areaHa).toLocaleString()}-hectare {subject.licenceType.toLowerCase()} title held by {subject.holder} in the {REGION_MAP[subject.regionId].name}. The nearest recorded mineralisation is inferred to be {subject.commodities.map((c) => c.toLowerCase()).join(" and ")}, with {subject.endowment} MINEDEX deposit{subject.endowment === 1 ? "" : "s"} logged within 25&nbsp;km. On the Haxax indicator it scores {subject.score}/100 (P{subject.scorePercentile} of its region) and screens as <strong style={{ color: recTone }}>{subject.action}</strong>.</>
                    )}
                  </p>
                </MemoSection>

                {/* 2 — Subject & tenure */}
                <MemoSection n="2" title="Subject &amp; tenure particulars">
                  <table className="memo-particulars">
                    <tbody>
                      <Par k="Tenement" v={subject.id} />
                      <Par k="Licence type" v={subject.licenceType} />
                      <Par k="Status" v={subject.status} />
                      <Par k="Registered holder" v={`${subject.holder} (${subject.holderType})`} />
                      {subject.holders.length > 1 && <Par k="Co-holders" v={subject.holders.slice(1).join("; ")} />}
                      <Par k="Ownership" v={subject.ownershipComplexity} />
                      <Par k="Area" v={`${fmtHa(subject.areaHa)} · ${subject.blocks} graticular blocks`} />
                      <Par k="Granted" v={longDate(new Date(subject.grantDate))} />
                      <Par k="Expiry" v={realExpiry ? longDate(new Date(subject.expiryDate)) : "Not stated on register"} />
                      <Par k="Survey status" v={subject.surveyStatus} />
                      <Par k="Region" v={REGION_MAP[subject.regionId].name} />
                    </tbody>
                  </table>
                </MemoSection>

                {/* 3 — Investment thesis */}
                <MemoSection n="3" title="Investment thesis">
                  <p>{aiMemo?.thesis ?? subject.ai.thesis}</p>
                  <ul className="memo-list">
                    {(aiMemo?.upside ?? subject.ai.upside).map((u, i) => <li key={i}>{u}</li>)}
                  </ul>
                </MemoSection>

                {/* 4 — Endowment & mineralisation */}
                <MemoSection n="4" title="Endowment &amp; nearby mineralisation">
                  <p>{aiMemo?.geology ?? `${subject.endowment} recorded MINEDEX deposit${subject.endowment === 1 ? "" : "s"} lie within 25 km${subject.nearbyMines[0] ? ` (nearest, ${subject.nearbyMines[0].name}, at ${subject.nearbyMines[0].distanceKm} km)` : ""}. ${subject.drillHolesNearby} DMIRS drill collar${subject.drillHolesNearby === 1 ? "" : "s"} are logged within 10 km of the ground.`}</p>
                  {subject.nearbyMines.length > 0 && (
                    <ul className="memo-list">
                      {subject.nearbyMines.map((m, i) => (
                        <li key={i}>{m.name} — {m.commodity}, {m.distanceKm}&nbsp;km, {m.status.toLowerCase()}.</li>
                      ))}
                    </ul>
                  )}
                  <p className="memo-note">Bedrock geology (GSWA) and native-title status (NNTT) for this precise ground are resolved live in the tenement detail panel.</p>
                </MemoSection>

                {/* 5 — Key risks */}
                <MemoSection n="5" title="Key risks">
                  <ul className="memo-list">
                    {(aiMemo?.risks ?? subject.ai.risks).map((r, i) => <li key={i}>{r}</li>)}
                    {subject.riskFlags.map((r, i) => <li key={`f${i}`}>Register flag: {r.label} ({r.level}).</li>)}
                  </ul>
                </MemoSection>

                {/* 6 — Valuation note */}
                <MemoSection n="6" title="Valuation note">
                  <p>
                    {aiMemo?.valuation ? aiMemo.valuation + " " : ""}
                    The public DMIRS register carries <strong>no sale price, rent, royalty, resource estimate or valuation</strong> for this tenement; accordingly, no dollar figure is asserted in this memorandum. The evidence bearing on value comprises the real endowment nearby ({subject.endowment} deposits within 25&nbsp;km), {subject.drillHolesNearby} drill collars within 10&nbsp;km, {fmtHa(subject.areaHa)} of ground and the holder profile{realExpiry ? ", together with expiry timing" : ""}. A defensible valuation would require primary data — comparable transactions, a JORC-compliant resource and exploration results — that is not on the public record.
                  </p>
                </MemoSection>

                {/* 7 — Recommendation */}
                <MemoSection n="7" title="Recommendation &amp; next steps">
                  <p>The desk’s disposition on {subject.id} is <strong style={{ color: recTone }}>{subject.action}</strong>. {verdict} Immediate next step: {nextStep}</p>
                </MemoSection>

                {/* signature block */}
                <div className="memo-sign">
                  <div className="memo-sign-col">
                    <div className="memo-sign-line" />
                    <div className="memo-sign-role">Prepared by · Haxax Acquisitions Desk</div>
                    <div className="memo-sign-date">Date: {longDate(today)}</div>
                  </div>
                  <div className="memo-sign-col">
                    <div className="memo-sign-line" />
                    <div className="memo-sign-role">Reviewed by · Investment Committee</div>
                    <div className="memo-sign-date">Date: _______________</div>
                  </div>
                </div>

                {/* basis of preparation */}
                <div className="memo-basis">
                  <span className="memo-basis-h">Basis of preparation.</span> Prepared from the live Western Australian
                  public registers — DMIRS Mining Tenements, MINEDEX deposits, DMIRS drill-hole collars, GSWA geology,
                  Landgate boundaries and the National Native Title Tribunal. Figures are as at {longDate(today)} and are
                  subject to change without notice. The Haxax indicator is a transparent signal computed from these inputs;
                  it is not a rating, price or forecast.
                </div>
                <div className="memo-disclaimer">
                  This memorandum is a decision-support document for internal use only. It is not a valuation, appraisal,
                  financial product or advice, and it is not an offer or recommendation to deal in any tenement or security.
                  Verify all particulars against the official DMIRS register before relying on them.
                </div>

                <footer className="memo-docfoot">
                  <span>{ref}</span>
                  <span>Strictly Private &amp; Confidential</span>
                  <span>Page 1 of 1</span>
                </footer>
              </article>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Hdr({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="memo-hdr-row">
      <span className="memo-hdr-k">{k}</span>
      <span className={`memo-hdr-v ${mono ? "mono" : ""}`}>{v}</span>
    </div>
  );
}

function Par({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td className="memo-par-k">{k}</td>
      <td className="memo-par-v">{v}</td>
    </tr>
  );
}

function MemoSection({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="memo-sec">
      <h3 className="memo-sec-h"><span className="memo-sec-n">{n}.</span>{title}</h3>
      {children}
    </section>
  );
}

function MemoSkeleton() {
  return (
    <div className="memo-doc">
      <div className="col gap-3" style={{ padding: "var(--sp-6)" }}>
        <Skeleton w="40%" h={22} />
        <Skeleton w="70%" h={14} />
        <Skeleton w="100%" h={70} r={6} />
        <Skeleton w="30%" h={16} />
        <Skeleton w="100%" h={48} />
        <Skeleton w="90%" h={48} />
        <Skeleton w="30%" h={16} />
        <Skeleton w="100%" h={60} />
      </div>
    </div>
  );
}
