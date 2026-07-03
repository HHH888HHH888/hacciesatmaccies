import { useNavigate } from "react-router-dom";
import { Radio } from "lucide-react";
import { useStore } from "../lib/store";

const TYPE_LABEL: Record<string, string> = {
  application: "APP",
  expiry: "EXP",
  transfer: "TFR",
  status: "STAT",
  exploration: "DRILL",
  score: "SCORE",
};

export function LiveTicker() {
  const feed = useStore((s) => s.feed);
  const select = useStore((s) => s.select);
  const navigate = useNavigate();
  const items = feed.slice(0, 22);

  const go = (id: string) => {
    select(id);
    navigate("/map");
  };

  // duplicate for seamless marquee
  const loop = [...items, ...items];

  return (
    <div className="ticker" aria-label="Live activity feed">
      <div className="ticker-label">
        <span className="live-pip" /> Live
      </div>
      <div className="ticker-track">
        <div className="ticker-rail">
          {loop.map((e, i) => (
            <span
              key={`${e.id}-${i}`}
              className="ticker-item"
              onClick={() => go(e.tenementId)}
              role="button"
              tabIndex={-1}
            >
              <span className="ti-type">{TYPE_LABEL[e.type] ?? e.type}</span>
              <span className="ti-id">{e.tenementId}</span>
              <span>{e.text}</span>
              <Radio size={11} className="faint" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
