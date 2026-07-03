import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Lock, ShieldCheck, User } from "lucide-react";
import { useStore } from "../lib/store";
import { HaxaxMark } from "./Logo";

const ACCOUNT_META: Record<string, { icon: typeof User; tagline: string }> = {
  Admin: { icon: ShieldCheck, tagline: "Primary operator · full control" },
  Guest: { icon: User, tagline: "Shared access · read & analyse" },
};

/** Site lock → account selection → sign-in. All verified server-side. */
export function AuthScreens() {
  const auth = useStore((s) => s.auth);
  return auth.gate ? <AccountStage /> : <GateStage />;
}

/* ---------- stage 1: site password ---------- */
function GateStage() {
  const unlock = useStore((s) => s.unlock);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true); setErr(false);
    const ok = await unlock(pw);
    setBusy(false);
    if (!ok) { setErr(true); setPw(""); inputRef.current?.focus(); }
  };

  return (
    <div className="auth-screen">
      <form className={`auth-card ${err ? "auth-shake" : ""}`} onSubmit={submit}>
        <div className="auth-mark"><HaxaxMark size={40} /></div>
        <div className="auth-word">HAXAX</div>
        <div className="auth-eyebrow"><Lock size={12} /> Restricted access</div>
        <p className="auth-sub">This terminal is private. Enter the access key to continue.</p>
        <div className="auth-field">
          <input
            ref={inputRef}
            type="password"
            className="auth-input"
            placeholder="Access key"
            value={pw}
            autoComplete="off"
            onChange={(e) => { setPw(e.target.value); setErr(false); }}
          />
        </div>
        {err && <div className="auth-err">Incorrect access key.</div>}
        <button className="auth-btn" type="submit" disabled={busy || !pw}>
          {busy ? "Checking…" : <>Unlock <ArrowRight size={15} /></>}
        </button>
        <div className="auth-foot">haxax.com · single-tenant intelligence terminal</div>
      </form>
    </div>
  );
}

/* ---------- stage 2: pick an account, then sign in ---------- */
function AccountStage() {
  const auth = useStore((s) => s.auth);
  const login = useStore((s) => s.login);
  const logout = useStore((s) => s.logout);
  const [picked, setPicked] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (picked) inputRef.current?.focus(); }, [picked]);

  const pick = (acct: string) => { setPicked(acct); setPw(""); setErr(false); };
  const back = () => { setPicked(null); setPw(""); setErr(false); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked || !pw || busy) return;
    setBusy(true); setErr(false);
    const ok = await login(picked, pw);
    setBusy(false);
    if (!ok) { setErr(true); setPw(""); inputRef.current?.focus(); }
  };

  if (picked) {
    const meta = ACCOUNT_META[picked] ?? ACCOUNT_META.Guest;
    const Icon = meta.icon;
    return (
      <div className="auth-screen">
        <form className={`auth-card ${err ? "auth-shake" : ""}`} onSubmit={submit}>
          <button type="button" className="auth-back" onClick={back}><ArrowLeft size={13} /> Accounts</button>
          <div className="auth-acct-avatar"><Icon size={26} /></div>
          <div className="auth-acct-name">{picked}</div>
          <div className="auth-acct-tag">{meta.tagline}</div>
          <div className="auth-field">
            <input
              ref={inputRef}
              type="password"
              className="auth-input"
              placeholder={`${picked} password`}
              value={pw}
              autoComplete="off"
              onChange={(e) => { setPw(e.target.value); setErr(false); }}
            />
          </div>
          {err && <div className="auth-err">Incorrect password.</div>}
          <button className="auth-btn" type="submit" disabled={busy || !pw}>
            {busy ? "Signing in…" : <>Sign in <ArrowRight size={15} /></>}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card auth-card--wide">
        <div className="auth-mark"><HaxaxMark size={36} /></div>
        <div className="auth-word">HAXAX</div>
        <p className="auth-sub">Select an account to sign in.</p>
        <div className="auth-accounts">
          {auth.accounts.map((acct) => {
            const meta = ACCOUNT_META[acct] ?? ACCOUNT_META.Guest;
            const Icon = meta.icon;
            return (
              <button key={acct} className="auth-acct" onClick={() => pick(acct)}>
                <span className="auth-acct-avatar"><Icon size={24} /></span>
                <span className="auth-acct-name">{acct}</span>
                <span className="auth-acct-tag">{meta.tagline}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="auth-lock-link" onClick={logout}>Lock terminal</button>
      </div>
    </div>
  );
}
