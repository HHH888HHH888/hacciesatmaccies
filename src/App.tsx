import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { bootstrapData, useStore } from "./lib/store";
import type { FeedEvent, FeedEventType } from "./lib/types";
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

function simulatedFeedEvent(): FeedEvent | null {
  const ts = useStore.getState().tenements;
  if (!ts.length) return null;
  const t = ts[Math.floor(Math.random() * ts.length)];
  const tpls: { type: FeedEventType; text: string }[] = [
    { type: "application", text: `New ${t.licenceType.toLowerCase()} application lodged near ${t.district} (${t.regionId}).` },
    { type: "expiry", text: `${t.id} flagged for expiry review — ${t.holder}.` },
    { type: "transfer", text: `Title dealing registered on ${t.id}.` },
    { type: "exploration", text: `Drilling reported near ${t.id}: ${(2 + Math.random() * 10).toFixed(1)}m @ ${(1 + Math.random() * 8).toFixed(1)} g/t.` },
    { type: "score", text: `Haxax Score on ${t.id} revised to ${t.score} after data refresh.` },
  ];
  const tpl = tpls[Math.floor(Math.random() * tpls.length)];
  return { id: `F${Date.now()}-${Math.floor(Math.random() * 999)}`, type: tpl.type, tenementId: t.id, text: tpl.text, timestamp: new Date().toISOString() };
}

export default function App() {
  const theme = useStore((s) => s.theme);
  const dataStatus = useStore((s) => s.dataStatus);
  const auth = useStore((s) => s.auth);
  const refreshAuth = useStore((s) => s.refreshAuth);
  const setCommandOpen = useStore((s) => s.setCommandOpen);
  const pushFeed = useStore((s) => s.pushFeed);
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

  // simulated live event stream (over whatever dataset is loaded)
  useEffect(() => {
    const id = window.setInterval(() => {
      const e = simulatedFeedEvent();
      if (e) pushFeed(e);
      bumpSync();
    }, 9000);
    return () => window.clearInterval(id);
  }, [pushFeed, bumpSync]);

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
