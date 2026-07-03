import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Command as CommandIcon, Crosshair, LogOut, Moon, Search, ShieldCheck, Star, Sun, User } from "lucide-react";
import { assessTenement, useStore } from "../lib/store";
import { useClickOutside } from "../lib/hooks";
import { HaxaxLogo } from "./Logo";
import { ScoreChip, CommodityTag } from "./ui";
import { REGION_MAP } from "../lib/geo";

export function TopNav() {
  const navigate = useNavigate();
  const select = useStore((s) => s.select);
  const setCommandOpen = useStore((s) => s.setCommandOpen);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const watchCount = useStore((s) => s.watchlist.length);
  const unread = useStore((s) => s.alerts.filter((a) => !a.read).length);
  const tenements = useStore((s) => s.tenements);
  const dataStatus = useStore((s) => s.dataStatus);
  const dataSource = useStore((s) => s.dataSource);

  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessMsg, setAssessMsg] = useState("");
  const searchRef = useClickOutside<HTMLDivElement>(() => setFocused(false));

  const looksLikeId = (s: string) => /[a-z]/i.test(s) && /\d\s*\/\s*\d/.test(s);
  const doAssess = async (raw: string) => {
    setAssessing(true);
    setAssessMsg("");
    const r = await assessTenement(raw);
    setAssessing(false);
    if (r.ok && r.id) { select(r.id); navigate("/map"); setQ(""); setFocused(false); }
    else setAssessMsg(`“${raw.toUpperCase()}” not found in the live register.`);
  };

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return tenements.filter((t) =>
      `${t.id} ${t.holder} ${t.district} ${t.commodities.join(" ")}`.toLowerCase().includes(s),
    ).slice(0, 8);
  }, [q, tenements]);

  const choose = (id: string) => {
    select(id);
    navigate("/map");
    setQ("");
    setFocused(false);
  };

  return (
    <header className="topnav">
      <HaxaxLogo />
      <span className={`data-pill data-pill--${dataStatus} hide-sm`} title={dataSource}>
        <span className="dp-dot" />
        {dataStatus === "live" ? "LIVE" : dataStatus === "mock" ? "OFFLINE" : "SYNC"}
      </span>
      <span className="nav-divider hide-sm" />

      <div className="global-search" ref={searchRef}>
        <Search size={15} className="gs-icon" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setFocused(true); }}
          onFocus={() => setFocused(true)}
          placeholder="Search tenement, holder, project, commodity or district…"
          aria-label="Global search"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (results[0]) choose(results[0].id);
              else if (looksLikeId(q) && !assessing) doAssess(q);
            }
            if (e.key === "Escape") setFocused(false);
          }}
        />
        {!q && <span className="gs-kbd kbd hide-sm">/</span>}
        {focused && results.length > 0 && (
          <div className="gs-results">
            {results.map((t) => (
              <div key={t.id} className="gs-result" onMouseDown={() => choose(t.id)}>
                <ScoreChip score={t.score} size="sm" />
                <span className="gs-id">{t.id}</span>
                <CommodityTag c={t.commodities[0]} />
                <span className="gs-meta">{t.holder} · {REGION_MAP[t.regionId].name}</span>
              </div>
            ))}
          </div>
        )}
        {focused && q && results.length === 0 && (
          <div className="gs-results">
            {looksLikeId(q) ? (
              <div className="gs-result gs-assess" onMouseDown={(e) => { e.preventDefault(); if (!assessing) doAssess(q); }}>
                <Crosshair size={15} style={{ color: "var(--accent)" }} className={assessing ? "spin" : ""} />
                <span className="gs-id">{q.toUpperCase()}</span>
                <span className="gs-meta">
                  {assessing ? "Pulling from the live register…" : assessMsg || "Assess this tenement from the live WA register →"}
                </span>
              </div>
            ) : (
              <div className="gs-result" style={{ color: "var(--text-muted)" }}>
                No tenements match “{q}”. Type a tenement ID (e.g. E70/3890) to assess it from the register.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="nav-actions">
        <button className="btn hide-sm" onClick={() => setCommandOpen(true)} aria-label="Open command bar">
          <CommandIcon size={14} /> <span className="hide-sm">Command</span>
          <span className="kbd" style={{ marginLeft: 2 }}>⌘K</span>
        </button>
        <button className="icon-btn" onClick={() => navigate("/watchlist")} aria-label="Watchlist" title="Watchlist">
          <Star size={17} />
          {watchCount > 0 && <span className="count-badge">{watchCount}</span>}
        </button>
        <button className="icon-btn" onClick={() => navigate("/alerts")} aria-label="Alerts" title="Alerts">
          <Bell size={17} />
          {unread > 0 && <span className="dot-badge" />}
        </button>
        <button
          className="icon-btn"
          onClick={toggleTheme}
          aria-label="Toggle colour theme"
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <span className="nav-divider hide-sm" />
        <SystemClock />
        <AccountChip />
      </div>
    </header>
  );
}

/* signed-in account + lock control */
function AccountChip() {
  const account = useStore((s) => s.auth.account);
  const logout = useStore((s) => s.logout);
  if (!account) return null;
  const Icon = account === "Admin" ? ShieldCheck : User;
  return (
    <div className="acct-chip" title={`Signed in as ${account}`}>
      <Icon size={14} className="acct-chip-ic" />
      <span className="acct-chip-name hide-sm">{account}</span>
      <button className="acct-chip-out" onClick={logout} aria-label="Sign out and lock terminal" title="Sign out · lock terminal">
        <LogOut size={14} />
      </button>
    </div>
  );
}

/* live AWST mission clock — an instrument readout, not an account */
function SystemClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const t = now.toLocaleTimeString("en-GB", { timeZone: "Australia/Perth", hour12: false });
  return (
    <div className="sys-clock hide-sm" title="Operator session · Perth time (AWST)">
      <span className="sys-clock-zone">AWST</span>
      <span className="sys-clock-time mono">{t}</span>
    </div>
  );
}
