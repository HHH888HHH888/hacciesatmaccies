import { useEffect, useRef, useState } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { useStore } from "../lib/store";
import { HaxaxMark } from "./Logo";

/** Single access code → the terminal. Verified server-side. */
export function AuthScreens() {
  const login = useStore((s) => s.login);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true); setErr(false);
    const ok = await login(pw);
    setBusy(false);
    if (!ok) { setErr(true); setPw(""); inputRef.current?.focus(); }
  };

  return (
    <div className="auth-screen">
      <form className={`auth-card ${err ? "auth-shake" : ""}`} onSubmit={submit}>
        <div className="auth-mark"><HaxaxMark size={40} /></div>
        <div className="auth-word">HAXAX</div>
        <div className="auth-eyebrow"><Lock size={12} /> Restricted access</div>
        <p className="auth-sub">This terminal is private. Enter the access code to continue.</p>
        <div className="auth-field">
          <input
            ref={inputRef}
            type="password"
            className="auth-input"
            placeholder="Access code"
            value={pw}
            autoComplete="current-password"
            onChange={(e) => { setPw(e.target.value); setErr(false); }}
          />
        </div>
        {err && <div className="auth-err">Incorrect access code.</div>}
        <button className="auth-btn" type="submit" disabled={busy || !pw}>
          {busy ? "Checking…" : <>Enter <ArrowRight size={15} /></>}
        </button>
        <div className="auth-foot">haxax.com · single-operator intelligence terminal · <a href="#/privacy" className="auth-foot-link">Privacy</a> · <a href="#/terms" className="auth-foot-link">Terms</a></div>
      </form>
    </div>
  );
}
