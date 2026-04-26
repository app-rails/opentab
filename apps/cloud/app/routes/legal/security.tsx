import { SECURITY_EMAIL } from "~/lib/external-links";
import { getPageTitle } from "~/lib/utils";
import type { Route } from "./+types/security";

export function meta() {
  return [{ title: getPageTitle("Security") }];
}

export default function SecurityRoute(_: Route.ComponentProps) {
  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="space-y-3 border-border border-b pb-8">
        <h1 className="font-bold text-3xl tracking-tight">Security</h1>
        <p className="text-muted-foreground text-sm">Last updated: April 26, 2026</p>
        <p className="text-muted-foreground leading-relaxed">
          At OpenTab, protecting your data is a core priority. This page outlines our current
          security practices and our roadmap for continued improvement. OpenTab is local-first;
          cloud sync is opt-in, and the surface we secure is intentionally small.
        </p>
      </header>

      {/* 1. Infrastructure */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">1. Infrastructure</h2>
        <p className="text-muted-foreground leading-relaxed">
          OpenTab Cloud is deployed on Cloudflare&apos;s global edge network. Application logic runs
          on Cloudflare Workers; durable state is stored in Cloudflare D1 (SQLite at the edge);
          ephemeral state and rate-limit counters live in Cloudflare KV. We do not run our own
          database or compute servers.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          The browser extension stores its data in your browser&apos;s local IndexedDB. That data
          never leaves your device unless you opt into cloud sync.
        </p>
      </section>

      {/* 2. Encryption */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">2. Data Encryption</h2>
        <ul className="list-disc space-y-1.5 pl-6 text-muted-foreground leading-relaxed">
          <li>
            <strong>In transit</strong> — All traffic between the extension/browser and the cloud
            Service is encrypted using TLS 1.2 or higher.
          </li>
          <li>
            <strong>At rest</strong> — Data stored in Cloudflare D1 and KV is encrypted at rest by
            Cloudflare&apos;s infrastructure.
          </li>
        </ul>
      </section>

      {/* 3. Authentication */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">3. Authentication</h2>
        <p className="text-muted-foreground leading-relaxed">
          OpenTab Cloud uses two distinct credential models:
        </p>
        <ul className="list-disc space-y-1.5 pl-6 text-muted-foreground leading-relaxed">
          <li>
            <strong>Web sign-in</strong> — Email + password (with rate-limiting and bcrypt hashing)
            or OAuth via supported third-party providers, managed by Better Auth. Sessions are
            short-lived and bound to a secure, HTTP-only cookie.
          </li>
          <li>
            <strong>Extension sync</strong> — Each connected device exchanges a one-time
            authorization code for a long-lived opaque device token. The server stores only a
            SHA-256 hash of the token; the raw token never leaves the device that received it. You
            can revoke individual devices at any time.
          </li>
        </ul>
      </section>

      {/* 4. Access Controls */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">4. Access Controls</h2>
        <p className="text-muted-foreground leading-relaxed">
          Every cloud query is scoped by the authenticated user&apos;s id. There is no shared or
          cross-user data path. We follow the principle of least privilege for internal system
          access, and audit any administrator actions on production data.
        </p>
      </section>

      {/* 5. Application Security */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">5. Application Security</h2>
        <p className="text-muted-foreground leading-relaxed">
          Our development process incorporates security at every stage:
        </p>
        <ul className="list-disc space-y-1.5 pl-6 text-muted-foreground leading-relaxed">
          <li>Code review required for all changes before deployment.</li>
          <li>Automated dependency scanning to detect known vulnerabilities.</li>
          <li>
            Runtime input validation on every API request via shared zod schemas (used by both
            client and server).
          </li>
          <li>Per-user, per-endpoint rate limits for cloud sync operations.</li>
          <li>Content Security Policy (CSP) and other HTTP security headers on all responses.</li>
        </ul>
      </section>

      {/* 6. Sync Protocol Safety */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">6. Sync Protocol Safety</h2>
        <p className="text-muted-foreground leading-relaxed">
          OpenTab&apos;s sync protocol is conservative on purpose:
        </p>
        <ul className="list-disc space-y-1.5 pl-6 text-muted-foreground leading-relaxed">
          <li>
            Sync is opt-in. You explicitly choose to upload local data the first time you enable
            cloud sync, and we never auto-upload silently.
          </li>
          <li>
            Last-Write-Wins (LWW) conflict resolution with monotonic operation IDs avoids data loss
            from clock drift in routine cases; out-of-order &quot;update&quot; ops on never-existing
            entities are skipped rather than auto-created.
          </li>
          <li>
            Soft-deletes propagate as tombstones so deletes on one device cannot resurrect from
            another device&apos;s stale snapshot.
          </li>
        </ul>
      </section>

      {/* 7. Incident Response */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">7. Incident Response</h2>
        <p className="text-muted-foreground leading-relaxed">
          In the event of a security incident, we follow a structured response process:
        </p>
        <ul className="list-disc space-y-1.5 pl-6 text-muted-foreground leading-relaxed">
          <li>
            <strong>Detection</strong> — Monitoring and alerting systems to identify potential
            incidents.
          </li>
          <li>
            <strong>Containment</strong> — Immediate steps to limit the scope and impact, including
            forced device-token rotation if applicable.
          </li>
          <li>
            <strong>Notification</strong> — Affected users will be notified within 72 hours of
            confirmed incidents involving personal data.
          </li>
          <li>
            <strong>Remediation</strong> — Root cause analysis and corrective measures to prevent
            recurrence; postmortem published when public-interest warrants.
          </li>
        </ul>
      </section>

      {/* 8. Compliance Roadmap */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">8. Compliance Roadmap</h2>
        <p className="text-muted-foreground leading-relaxed">
          We are actively working toward the following standards:
        </p>
        <ul className="list-disc space-y-1.5 pl-6 text-muted-foreground leading-relaxed">
          <li>GDPR data-subject-rights workflows (in place; export and deletion supported).</li>
          <li>SOC 2 Type II audit (planned once usage scale justifies the cost).</li>
          <li>Periodic third-party penetration testing (planned).</li>
        </ul>
        <p className="text-muted-foreground leading-relaxed">
          We will update this page as we achieve new milestones.
        </p>
      </section>

      {/* 9. Responsible Disclosure */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">9. Responsible Disclosure</h2>
        <p className="text-muted-foreground leading-relaxed">
          We value the security research community. If you discover a vulnerability in the extension
          or cloud Service, we encourage you to report it responsibly:
        </p>
        <ul className="list-disc space-y-1.5 pl-6 text-muted-foreground leading-relaxed">
          <li>
            Email your findings to{" "}
            <a href={`mailto:${SECURITY_EMAIL}`} className="text-primary hover:underline">
              {SECURITY_EMAIL}
            </a>{" "}
            with &quot;Security Report&quot; in the subject line.
          </li>
          <li>Provide sufficient detail for us to reproduce and address the issue.</li>
          <li>
            Allow reasonable time for us to investigate and remediate before public disclosure.
          </li>
        </ul>
        <p className="text-muted-foreground leading-relaxed">
          We do not currently run a paid bug-bounty program but will publicly credit reporters who
          follow this policy and request acknowledgement.
        </p>
      </section>

      {/* 10. Contact */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">10. Contact</h2>
        <p className="text-muted-foreground leading-relaxed">
          For security-related inquiries, please contact us at{" "}
          <a href={`mailto:${SECURITY_EMAIL}`} className="text-primary hover:underline">
            {SECURITY_EMAIL}
          </a>
          .
        </p>
      </section>
    </div>
  );
}
