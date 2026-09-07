import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { HaxaxMark } from "../components/Logo";

const EFFECTIVE = "19 July 2026";
const CONTACT = "legal@haxax.com"; // change to your monitored inbox

/* Publicly viewable — rendered outside the access gate. Tailored to what Haxax
   is and does. Not legal advice; have it reviewed before you rely on it. */
export function Terms() {
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

        <h1 className="legal-title">Terms of Use</h1>
        <p className="legal-meta">Effective {EFFECTIVE}</p>

        <p className="legal-lead">
          These terms govern your access to and use of Haxax, a private mining-tenement intelligence
          terminal for Western Australia. By accessing the service you agree to these terms. If you do
          not agree, do not use the service. In these terms, “Haxax”, “we” and “us” refer to the
          operator of this service, and “you” refers to a person granted access to it.
        </p>

        <Section n="1" title="Authorised access only">
          <p>Haxax is private and is intended for a small number of authorised users. Access is
            controlled by a site access key and account credentials. You must keep those credentials
            confidential, must not share them, and are responsible for activity conducted under your
            account. We may suspend or revoke access at any time.</p>
        </Section>

        <Section n="2" title="Nature of the service — decision support only">
          <p>Haxax aggregates information from public Western Australian government registers and
            presents it alongside computed indicators (such as the Haxax indicator, opportunity and
            endowment signals). It is a research and decision-support tool. It is <strong>not</strong> a
            valuation, an appraisal, a financial product, or professional advice of any kind.</p>
          <p>The computed indicators are transparent signals derived from real register inputs — they
            are <strong>not</strong> a rating, a price, or a prediction of value, return or outcome, and
            should not be treated as one.</p>
        </Section>

        <Section n="3" title="No financial or investment advice">
          <p>Nothing in Haxax constitutes financial, investment, legal, tax or professional advice, and
            nothing here is a recommendation to acquire, dispose of, or deal in any tenement, security
            or asset. Screens and calls (such as “Acquire” or “Investigate”) are model outputs for your
            own research, not advice. You should obtain your own independent professional advice before
            making any decision.</p>
        </Section>

        <Section n="4" title="Accuracy and the official register">
          <p>Haxax draws on third-party government data that may be incomplete, delayed, cached, or
            change without notice, and on computed fields that are estimates. We do not warrant that any
            information is accurate, current or complete. The public register carries no valuation, sale
            price, rent, royalty, grade, tonnage or resource for a tenement, and Haxax does not supply
            any such figure.</p>
          <p><strong>Before relying on anything in Haxax, you must verify it against the authoritative
            source</strong> — the DMIRS Mineral Titles / TENGRAPH register and other official records —
            and conduct your own due diligence. The official register prevails over anything shown here.</p>
        </Section>

        <Section n="5" title="Acceptable use">
          <p>You agree not to: use the service for any unlawful purpose; misuse personal information of
            tenement holders shown from public registers (including for direct marketing, harassment, or
            any purpose prohibited by law); attempt to breach, probe or circumvent the service’s security
            or access controls; or place unreasonable load on, scrape, or resell the service or the
            third-party data behind it in breach of the source providers’ terms.</p>
        </Section>

        <Section n="6" title="Third-party data and services">
          <p>Tenement, geology, native-title, deposit and boundary data are sourced from Western
            Australian government services (DMIRS, Landgate SLIP, GSWA, NNTT) and remain subject to those
            providers’ own terms and licences. Written analysis is generated with a third-party AI
            provider. These services are provided by their respective owners; we are not responsible for
            their availability, accuracy or terms, and their rights in their data are reserved.</p>
        </Section>

        <Section n="7" title="Intellectual property">
          <p>The Haxax application, its interface, scoring methodology and original content are owned by
            the operator. Underlying government data belongs to the respective government agencies. You
            are granted a limited, revocable, non-transferable right to use the service for your own
            internal research while your access remains authorised.</p>
        </Section>

        <Section n="8" title="Availability">
          <p>The service is provided on an “as is” and “as available” basis. We do not guarantee that it
            will be uninterrupted, error-free or continuously available, and we may modify, suspend or
            discontinue any part of it at any time without notice.</p>
        </Section>

        <Section n="9" title="Limitation of liability">
          <p>To the maximum extent permitted by law, we exclude all warranties not expressly stated here,
            and we are not liable for any loss or damage — including any loss arising from decisions made
            or not made in reliance on the service, or from any inaccuracy, delay or unavailability of
            data. Nothing in these terms excludes, restricts or modifies any consumer guarantee, right or
            remedy under the Australian Consumer Law or other law that cannot lawfully be excluded. Where
            liability can be limited, it is limited to re-supplying the service.</p>
        </Section>

        <Section n="10" title="Changes to these terms">
          <p>We may update these terms from time to time. Material changes are indicated by updating the
            “Effective” date above. Your continued use of the service after a change means you accept the
            updated terms.</p>
        </Section>

        <Section n="11" title="Governing law">
          <p>These terms are governed by the laws of Western Australia, Australia, and you submit to the
            non-exclusive jurisdiction of the courts of that State.</p>
        </Section>

        <Section n="12" title="Contact">
          <p>Questions about these terms can be sent to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
        </Section>

        <footer className="legal-foot">
          See also our <a href="#/privacy">Privacy Policy</a>. Haxax · Western Australian
          mining-tenement intelligence · data sourced from public DMIRS / SLIP / GSWA / NNTT registers.
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
