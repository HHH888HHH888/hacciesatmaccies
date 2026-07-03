import type { TimelineEvent } from "../lib/types";
import { fmtDate } from "../lib/format";

export function TenementTimeline({ events }: { events: TimelineEvent[] }) {
  // most recent first for the panel reads better, but keep chronological with future last
  const ordered = [...events].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  return (
    <div className="timeline">
      {ordered.map((e, i) => {
        const future = +new Date(e.date) > Date.now();
        const cls =
          e.type === "drilling" ? "is-drill" : e.type === "grant" ? "is-grant" : future ? "is-future" : "";
        return (
          <div className={`tl-event ${cls}`} key={i}>
            <span className="tl-node" />
            <div className="tl-date">
              {fmtDate(e.date)}
              {future && <span style={{ color: "var(--accent)" }}> · scheduled</span>}
            </div>
            <div className="tl-title">{e.title}</div>
            <div className="tl-detail">{e.detail}</div>
          </div>
        );
      })}
    </div>
  );
}
