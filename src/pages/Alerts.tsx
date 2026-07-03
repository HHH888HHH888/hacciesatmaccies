import { useMemo, useState } from "react";
import { CheckCheck } from "lucide-react";
import { useStore } from "../lib/store";
import { relTime } from "../lib/format";
import { EmptyState, Pill, SeverityDot, sevColor } from "../components/ui";
import type { AlertType } from "../lib/types";

const TYPE_LABEL: Record<AlertType, string> = {
  expiry: "Expiry risk",
  competitor: "Competitor movement",
  title: "Title change",
  anomaly: "Data anomaly",
  heat: "District heat",
  adjacency: "Strategic adjacency",
};

export function Alerts() {
  const alerts = useStore((s) => s.alerts);
  const markAllRead = useStore((s) => s.markAllAlertsRead);
  const markRead = useStore((s) => s.markAlertRead);
  const select = useStore((s) => s.select);
  const [filter, setFilter] = useState<AlertType | "all" | "unread">("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: alerts.length, unread: alerts.filter((a) => !a.read).length };
    alerts.forEach((a) => (c[a.type] = (c[a.type] ?? 0) + 1));
    return c;
  }, [alerts]);

  const shown = useMemo(() => {
    if (filter === "all") return alerts;
    if (filter === "unread") return alerts.filter((a) => !a.read);
    return alerts.filter((a) => a.type === filter);
  }, [alerts, filter]);

  const open = (id: string, tenementId: string) => {
    markRead(id);
    select(tenementId);
  };

  return (
    <div className="page-scroll">
      <div className="page-head">
        <div>
          <h1>Alerts</h1>
          <div className="sub">{counts.unread} unread · {alerts.length} total · expiry, competitor, title, anomaly, heat & adjacency signals</div>
        </div>
        <div className="page-head-actions">
          <button className="btn" onClick={markAllRead} disabled={counts.unread === 0}>
            <CheckCheck size={14} /> Mark all read
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="chip-wrap" style={{ marginBottom: "var(--sp-4)" }}>
          <button className={`chip ${filter === "all" ? "is-active" : ""}`} onClick={() => setFilter("all")}>All · {counts.all}</button>
          <button className={`chip ${filter === "unread" ? "is-active" : ""}`} onClick={() => setFilter("unread")}>Unread · {counts.unread}</button>
          {(Object.keys(TYPE_LABEL) as AlertType[]).map((t) => (
            <button key={t} className={`chip ${filter === t ? "is-active" : ""}`} onClick={() => setFilter(t)}>
              {TYPE_LABEL[t]} · {counts[t] ?? 0}
            </button>
          ))}
        </div>

        <div className="card" style={{ overflow: "hidden" }}>
          {shown.length === 0 ? (
            <EmptyState title="No alerts here" hint="Nothing matches this filter right now." />
          ) : (
            shown.map((a) => (
              <div
                key={a.id}
                className={`alert-row ${a.read ? "" : "is-unread"}`}
                onClick={() => open(a.id, a.tenementId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && open(a.id, a.tenementId)}
              >
                <span className="alert-sev-bar" style={{ background: sevColor(a.severity) }} />
                <SeverityDot sev={a.severity} />
                <div className="alert-main">
                  <div className="alert-title">{a.title}</div>
                  <div className="alert-msg">{a.message}</div>
                  <div className="alert-meta">
                    <Pill tone="neutral">{TYPE_LABEL[a.type]}</Pill>
                    <span className="mono faint" style={{ fontSize: "var(--fs-10)" }}>{a.tenementId}</span>
                    <span className="faint" style={{ fontSize: "var(--fs-10)" }}>· {relTime(a.timestamp)}</span>
                  </div>
                </div>
                <span className="mono" style={{ fontSize: "var(--fs-10)", color: sevColor(a.severity), textTransform: "uppercase", fontWeight: 700 }}>
                  {a.severity}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
