import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  CornerDownLeft,
  FileText,
  LayoutDashboard,
  Map as MapIcon,
  Moon,
  Radar,
  Search,
  Star,
  Trello,
} from "lucide-react";
import { useStore } from "../lib/store";
import { ScoreChip } from "./ui";
import { REGION_MAP } from "../lib/geo";

interface Cmd {
  id: string;
  label: string;
  icon: typeof MapIcon;
  run: () => void;
  hint?: string;
}

export function CommandBar() {
  const open = useStore((s) => s.commandOpen);
  const setOpen = useStore((s) => s.setCommandOpen);
  const select = useStore((s) => s.select);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const toggleScan = useStore((s) => s.toggleScan);
  const allTenements = useStore((s) => s.tenements);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const close = () => setOpen(false);

  const commands: Cmd[] = useMemo(() => {
    const nav = (to: string) => () => {
      navigate(to);
      close();
    };
    return [
      { id: "overview", label: "Go to Overview", icon: LayoutDashboard, run: nav("/") },
      { id: "map", label: "Open Ground Intelligence Map", icon: MapIcon, run: nav("/map") },
      { id: "deals", label: "Open Deal Flow", icon: Trello, run: nav("/deals") },
      { id: "watch", label: "Open Watchlist", icon: Star, run: nav("/watchlist") },
      { id: "alerts", label: "Open Alerts", icon: Bell, run: nav("/alerts") },
      { id: "comps", label: "Open Comparables", icon: BarChart3, run: nav("/comparables") },
      { id: "memo", label: "Open IC Memo Generator", icon: FileText, run: nav("/memo") },
      { id: "data", label: "Open Data Health", icon: Activity, run: nav("/data") },
      {
        id: "scan",
        label: "Toggle Scan Mode (find underpriced clusters)",
        icon: Radar,
        run: () => {
          toggleScan();
          navigate("/map");
          close();
        },
      },
      { id: "theme", label: "Toggle colour theme", icon: Moon, run: () => { toggleTheme(); close(); } },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const s = q.trim().toLowerCase();
  const filteredCmds = s ? commands.filter((c) => c.label.toLowerCase().includes(s)) : commands;
  const tenements = s
    ? allTenements.filter((t) =>
        `${t.id} ${t.holder} ${t.district} ${t.commodities.join(" ")}`.toLowerCase().includes(s),
      ).slice(0, 6)
    : allTenements.slice(0, 4);

  const flat = [
    ...filteredCmds.map((c) => ({ kind: "cmd" as const, c })),
    ...tenements.map((t) => ({ kind: "tn" as const, t })),
  ];

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  if (!open) return null;

  const trigger = (i: number) => {
    const item = flat[i];
    if (!item) return;
    if (item.kind === "cmd") item.c.run();
    else {
      select(item.t.id);
      navigate("/map");
      close();
    }
  };

  return (
    <div
      className="cmd-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="cmd-panel" role="dialog" aria-label="Command bar">
        <div className="cmd-input-wrap">
          <Search size={18} className="muted" />
          <input
            ref={inputRef}
            className="cmd-input"
            value={q}
            placeholder="Search tenements or run a command…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); trigger(active); }
              else if (e.key === "Escape") close();
            }}
          />
          <span className="kbd">esc</span>
        </div>

        <div className="cmd-results">
          {filteredCmds.length > 0 && <div className="cmd-group-label">Actions</div>}
          {filteredCmds.map((c, i) => (
            <div
              key={c.id}
              className={`cmd-item ${active === i ? "is-active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); c.run(); }}
            >
              <c.icon size={16} className="ci-icon" />
              <span className="ci-main">{c.label}</span>
              {active === i && <CornerDownLeft size={13} className="faint" />}
            </div>
          ))}

          {tenements.length > 0 && <div className="cmd-group-label">Tenements</div>}
          {tenements.map((t, j) => {
            const i = filteredCmds.length + j;
            return (
              <div
                key={t.id}
                className={`cmd-item ${active === i ? "is-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); trigger(i); }}
              >
                <ScoreChip score={t.score} size="sm" />
                <span className="ci-main ci-id">{t.id}</span>
                <span className="ci-meta">
                  {t.holder} · {REGION_MAP[t.regionId].name}
                </span>
              </div>
            );
          })}

          {flat.length === 0 && (
            <div className="cmd-item" style={{ color: "var(--text-muted)" }}>
              No results for “{q}”
            </div>
          )}
        </div>

        <div className="cmd-foot">
          <span className="cf-item"><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
          <span className="cf-item"><span className="kbd">↵</span> select</span>
          <span className="cf-item"><span className="kbd">esc</span> close</span>
        </div>
      </div>
    </div>
  );
}
