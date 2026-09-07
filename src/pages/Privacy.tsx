import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { HaxaxMark } from "../components/Logo";

const EFFECTIVE = "19 July 2026";
const CONTACT = "privacy@haxax.com"; // change to your monitored inbox

/* Publicly viewable — rendered outside the access gate. Written to reflect what
   Haxax actually does with data. Not legal advice; have it reviewed before you
   rely on it commercially. */
export function Privacy() {
  const navigate = useNavigate();
  return (
    <div className="legal-page">
      <div className="legal-inner">
        <header className="legal-head">
          <div className="row center gap-2">
            <HaxaxMark size={28} />
            <span className="legal-word">HAXAX</span>
          </div>
          <button className="btn btn--sm" onClick={() => navigate("/")}>
            <ArrowLeft size={13} /> Back
          </button>
        </header>

        <h1 className="legal-title">Privacy Policy</h1>
        <p className="legal-meta">Effective {EFFECTIVE}</p>

        <p className="legal-lead">
          Haxax is a private mining-tenement intelligence terminal for Western Australia. It is
          built to be operated by a small number of authorised users and to surface information
          that is already published on public government registers. This policy explains what
          information the service handles, why, and your choices. In it, “Haxax”, “we” and “us”
          refer to the operator of this service; “you” refers to an authorised user.
        </p>

        <Section n="1" title="Information we collect from you">
          <p>We deliberately collect as little as possible about users. We do not run analytics,
            advertising or third-party trackers.</p>
          <ul>
            <li><strong>Authentication.</strong> When you sign in, you enter an access key and an
              account password. These are checked on our server against values held in server-side
              configuration; we do not store what you type beyond the moment of verification, and we
              never expose passwords to the browser.</li>
            <li><strong>Session cookies.</strong> On successful sign-in we set two strictly-necessary,
              HTTP-only cookies (a site-gate token and an account session token). They keep you signed
              in for about 12 hours and are not used for tracking or profiling.</li>
            <li><strong>Server logs.</strong> Like any website, our hosting provider may record standard
              technical data for each request — IP address, timestamp, requested path and browser
              user-agent — for security and reliability.</li>
            <li><strong>Preferences stored in your browser.</strong> Your theme, watchlist and deal-pipeline
              selections are saved in your own browser’s local storage, scoped to your account. This data
              stays on your device and is not transmitted to us or to anyone else.</li>
          </ul>
          <p>We do not collect your name, email address, phone number, location or payment details, and
            there is no account sign-up.</p>
        </Section>

        <Section n="2" title="Tenement and holder information">
          <p>The tenement records Haxax displays — including tenement holder names and the registered
            addresses that appear against them — are sourced directly from <strong>public Western
            Australian government registers</strong>, chiefly the DMIRS Mining Tenements register and
            related datasets published through Landgate’s SLIP platform, GSWA geology, the National
            Native Title Tribunal (NNTT) and Landgate boundary layers.</p>
          <p>This information is already publicly available on those statutory registers. Haxax
            reproduces and analyses it only for the purpose of mining-tenement research and
            acquisition intelligence. We do not sell it, and we do not combine it with other personal
            information to build profiles of individuals. If you are a tenement holder and have a
            question about how your register information appears here, contact us at{" "}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>; note that the authoritative source and any
            corrections are handled by the relevant government register.</p>
        </Section>

        <Section n="3" title="Third-party services">
          <p>Haxax relies on a small number of external services to function:</p>
          <ul>
            <li><strong>Western Australian government data services</strong> (DMIRS / Landgate SLIP,
              GSWA, NNTT). Haxax queries these public services for tenement, deposit, drill-hole,
              geology, native-title and boundary data. Data flows from them to Haxax; no personal
              information about you is sent to them beyond a standard web request.</li>
            <li><strong>AI research provider.</strong> To generate written research notes and memos,
              Haxax sends the <em>public register facts</em> for a selected tenement to a third-party
              large-language-model API (currently MiniMax; Anthropic Claude is supported as an
              alternative). Your login credentials and browser preferences are never sent. This
              processing may occur on servers outside Australia.</li>
            <li><strong>Hosting provider.</strong> The service runs on a cloud hosting provider that
              processes requests and may retain technical logs as described above.</li>
          </ul>
          <p>Each provider handles data under its own privacy terms.</p>
        </Section>

        <Section n="4" title="How we use information">
          <p>We use the limited information above to: authenticate you and keep the terminal private;
            operate, maintain and secure the service; and generate the tenement analysis you request.
            We do not use it for marketing, and we do not sell or rent it.</p>
        </Section>

        <Section n="5" title="Disclosure">
          <p>We do not disclose personal information to third parties except: to the service providers
            listed above so they can perform their function; or where we are required to do so by law,
            or to protect the security or legal rights of the service or its users.</p>
        </Section>

        <Section n="6" title="Data retention">
          <p>Session cookies expire automatically (about 12 hours) or when you sign out. Browser-stored
            preferences remain on your device until you clear them or your browser removes them. Server
            logs are retained only as long as needed for security and reliability, per our hosting
            provider’s defaults.</p>
        </Section>

        <Section n="7" title="Security">
          <p>Access to all tenement data is gated behind server-side authentication. Passwords are
            compared using constant-time hashing, sessions are signed (HMAC) and delivered as HTTP-only
            cookies, and the service is served over HTTPS. No online service can be guaranteed perfectly
            secure, but we take reasonable steps to protect the information we handle.</p>
        </Section>

        <Section n="8" title="Your rights">
          <p>Because we hold almost no personal information about users, there is little to access or
            correct. Where the Australian Privacy Act 1988 and the Australian Privacy Principles apply,
            you may request access to, or correction of, any personal information we hold about you, and
            you may make a privacy complaint. Contact us at{" "}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will respond within a reasonable period.
            You can also clear this site’s cookies and local storage from your browser at any time.</p>
        </Section>

        <Section n="9" title="Children">
          <p>Haxax is a professional tool and is not directed at, or intended for use by, children.</p>
        </Section>

        <Section n="10" title="Changes to this policy">
          <p>We may update this policy from time to time. Material changes will be reflected by updating
            the “Effective” date above. Continued use of the service after a change indicates acceptance
            of the updated policy.</p>
        </Section>

        <Section n="11" title="Contact">
          <p>Questions about this policy or your privacy can be sent to{" "}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
        </Section>

        <footer className="legal-foot">
          See also our <a href="#/terms">Terms of Use</a>. Haxax · Western Australian
          mining-tenement intelligence · data sourced from public DMIRS / SLIP / GSWA / NNTT / Landgate registers.
        </footer>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="legal-section">
      <h2 className="legal-h2"><span className="legal-num">{n}</span>{title}</h2>
      {children}
    </section>
  );
}
