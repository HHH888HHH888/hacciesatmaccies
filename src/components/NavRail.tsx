import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  Crosshair,
  FileText,
  LayoutDashboard,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Star,
  Trello,
} from "lucide-react";
import { useStore } from "../lib/store";

interface NavDef {
  to: string;
  label: string;
  icon: typeof MapIcon;
  badge?: boolean;
}

const NAV: NavDef[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/map", label: "Ground Map", icon: MapIcon },
  { to: "/opportunities", label: "Opportunities", icon: Crosshair },
  { to: "/deals", label: "Deal Flow", icon: Trello },
  { to: "/watchlist", label: "Watchlist", icon: Star },
  { to: "/alerts", label: "Alerts", icon: Bell, badge: true },
  { to: "/comparables", label: "Comparables", icon: BarChart3 },
  { to: "/memo", label: "IC Memo", icon: FileText },
  { to: "/data", label: "Data Health", icon: Activity },
];

export function NavRail() {
  const [expanded, setExpanded] = useState(false);
  const unread = useStore((s) => s.alerts.filter((a) => !a.read).length);
  const select = useStore((s) => s.select);

  return (
    <>
      <nav className={`nav-rail ${expanded ? "is-expanded" : ""}`} aria-label="Primary">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            onClick={() => select(null)}
            className={({ isActive }) => `nav-rail-item ${isActive ? "is-active" : ""}`}
            title={n.label}
          >
            <n.icon size={19} strokeWidth={1.9} />
            <span className="nri-label">{n.label}</span>
            {n.badge && unread > 0 && <span className="nri-badge">{unread}</span>}
          </NavLink>
        ))}
        <div className="nav-rail-spacer" />
        <button
          className="nav-rail-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
        >
          {expanded ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
          <span className="nri-label">Collapse</span>
        </button>
      </nav>

      {/* mobile bottom tab bar */}
      <nav className="mobile-tabbar" aria-label="Primary mobile">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            onClick={() => select(null)}
            className={({ isActive }) => `mtab ${isActive ? "is-active" : ""}`}
          >
            <n.icon size={19} strokeWidth={1.9} />
            <span>{n.label}</span>
            {n.badge && unread > 0 && <span className="mtab-badge" />}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
