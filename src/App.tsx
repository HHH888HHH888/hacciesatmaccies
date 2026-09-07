import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { bootstrapData, useStore } from "./lib/store";
import { TopNav } from "./components/TopNav";
import { NavRail } from "./components/NavRail";
import { AuthScreens } from "./components/AuthScreens";
import { LiveTicker } from "./components/LiveTicker";
import { CommandBar } from "./components/CommandBar";
import { DetailDrawer } from "./components/DetailDrawer";
import { HaxaxMark } from "./components/Logo";
import { Overview } from "./pages/Overview";
import { GroundMap } from "./pages/GroundMap";
import { Opportunities } from "./pages/Opportunities";
import { DealFlow } from "./pages/DealFlow";
import { Watchlist } from "./pages/Watchlist";
import { Alerts } from "./pages/Alerts";
import { Comparables } from "./pages/Comparables";
import { MemoGenerator } from "./pages/MemoGenerator";
import { DataHealth } from "./pages/DataHealth";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";

export default function App() {
  const theme = useStore((s) => s.theme);
  const dataStatus = useStore((s) => s.dataStatus);
  const auth = useStore((s) => s.auth);
  const refreshAuth = useStore((s) => s.refreshAuth);
  const setCommandOpen = useStore((s) => s.setCommandOpen);
  const bumpSync = useStore((s) => s.bumpSync);
  const location = useLocation();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0d0d0b" : "#efe9da");
  }, [theme]);

  // check the access lock first
  useEffect(() => { refreshAuth(); }, [refreshAuth]);

  // load the live register only once signed in
  useEffect(() => { if (auth.account) bootstrapData(); }, [auth.account]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCommandOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandOpen]);

  // keep the "live" timestamp ticking; real data changes arrive via the 30-min server refresh
  useEffect(() => {
    const id = window.setInterval(() => bumpSync(), 30000);
    return () => window.clearInterval(id);
  }, [bumpSync]);

  // legal pages are public — viewable with or without a session
  if (location.pathname === "/privacy") return <Privacy />;
  if (location.pathname === "/terms") return <Terms />;

  // access lock: gate password, then account selection
  if (!auth.ready) return <DataSplash label="Securing session…" />;
  if (!auth.account) return <AuthScreens />;

  if (dataStatus === "loading") return <DataSplash />;

  return (
    <div className="app">
      <TopNav />
      <div className="app-body">
        <NavRail />
        <main className="app-main" key={location.pathname}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/map" element={<GroundMap />} />
            <Route path="/opportunities" element={<Opportunities />} />
            <Route path="/deals" element={<DealFlow />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/comparables" element={<Comparables />} />
            <Route path="/memo" element={<MemoGenerator />} />
            <Route path="/data" element={<DataHealth />} />
            <Route path="*" element={<Overview />} />
          </Routes>
          <DetailDrawer />
        </main>
      </div>
      <LiveTicker />
      <CommandBar />
    </div>
  );
}

function DataSplash({ label }: { label?: string }) {
  return (
    <div className="splash">
      <div className="splash-mark"><HaxaxMark size={44} /></div>
      <div className="splash-word">HAXAX</div>
      <div className="splash-sub">{label ?? "Connecting to the Western Australia tenement register…"}</div>
      <div className="splash-bar"><span /></div>
      <div className="splash-src">DMIRS / SLIP · TENGRAPH · GeoVIEW.WA</div>
    </div>
  );
}
