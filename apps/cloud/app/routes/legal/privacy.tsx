import { Link } from "react-router";
import { SUPPORT_EMAIL } from "~/lib/external-links";
import { getPageTitle } from "~/lib/utils";
import type { Route } from "./+types/privacy";

export function meta() {
  return [{ title: getPageTitle("Privacy Policy") }];
}

export default function PrivacyRoute(_: Route.ComponentProps) {
  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="space-y-3 border-border border-b pb-8">
        <h1 className="font-bold text-3xl tracking-tight">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm">Effective date: April 26, 2026</p>
        <p className="text-muted-foreground leading-relaxed">
          This Privacy Policy describes how OpenTab (&quot;we&quot;, &quot;us&quot;, or
          &quot;our&quot;) collects, uses, and protects your information when you use the OpenTab
          browser extension and the OpenTab Cloud sync service (collectively, the
          &quot;Service&quot;).
        </p>
        <p className="text-muted-foreground leading-relaxed">
          OpenTab is local-first. The browser extension stores your workspaces, collections, and
          tabs on your device. We only receive data when you explicitly opt into cloud sync.
        </p>
      </header>

      {/* 1. Information We Collect */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">1. Information We Collect</h2>
        <h3 className="font-medium text-lg">Account Information</h3>
        <p className="text-muted-foreground leading-relaxed">
          When you create an OpenTab Cloud account, we collect your name, email address, and
          authentication credentials. If you sign in through a third-party provider (e.g., GitHub),
          we receive basic profile information from that provider.
        </p>
        <h3 className="font-medium text-lg">Synced Workspace Data</h3>
        <p className="text-muted-foreground leading-relaxed">
          When you enable cloud sync in the extension, we receive the workspaces, collections, and
          tabs you choose to upload. This includes tab URLs, page titles, favicon URLs, ordering,
          and timestamps. We do not collect page contents or browsing history beyond what you
          explicitly save into a collection.
        </p>
        <h3 className="font-medium text-lg">Device Metadata</h3>
        <p className="text-muted-foreground leading-relaxed">
          For each device you connect, we record a device label, last-seen timestamp, and an opaque
          device token (hashed before storage) used to authenticate sync requests.
        </p>
        <h3 className="font-medium text-lg">Usage Data</h3>
        <p className="text-muted-foreground leading-relaxed">
          We collect technical information about how the cloud Service is used: API endpoints
          accessed, request timestamps, IP address (for rate-limiting and abuse prevention), and
          basic browser/extension version information.
        </p>
      </section>

      {/* 2. How We Use Information */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">2. How We Use Information</h2>
        <p className="text-muted-foreground leading-relaxed">
          We use the information we collect to:
        </p>
        <ul className="list-disc space-y-1.5 pl-6 text-muted-foreground leading-relaxed">
          <li>Provide, maintain, and improve the Service.</li>
          <li>Synchronize your workspaces, collections, and tabs across your connected devices.</li>
          <li>
            Send you transactional communications (account verification, security alerts, sign-in
            notifications).
          </li>
          <li>Detect, prevent, and address fraud, abuse, or security issues.</li>
          <li>Comply with legal obligations.</li>
        </ul>
        <p className="text-muted-foreground leading-relaxed">
          We do not use your tab data to build advertising profiles or train third-party AI models.
        </p>
      </section>

      {/* 3. Information Sharing */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">3. Information Sharing</h2>
        <p className="text-muted-foreground leading-relaxed">
          We do not sell your personal information. We may share your data with:
        </p>
        <ul className="list-disc space-y-1.5 pl-6 text-muted-foreground leading-relaxed">
          <li>
            <strong>Service providers</strong> who help us operate the Service (e.g., Cloudflare for
            hosting and edge storage), under data processing agreements.
          </li>
          <li>
            <strong>Legal authorities</strong> when required by law, regulation, or valid legal
            process.
          </li>
          <li>
            <strong>Business transfers</strong> — in connection with a merger, acquisition, or sale
            of assets, your data may be transferred as part of that transaction.
          </li>
        </ul>
      </section>

      {/* 4. Cookies & Tracking */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">4. Cookies &amp; Local Storage</h2>
        <p className="text-muted-foreground leading-relaxed">
          The cloud Service uses cookies and similar technologies to maintain your session and
          remember preferences. These include:
        </p>
        <ul className="list-disc space-y-1.5 pl-6 text-muted-foreground leading-relaxed">
          <li>
            <strong>Essential cookies</strong> — required for sign-in, CSRF protection, and theme
            preference.
          </li>
        </ul>
        <p className="text-muted-foreground leading-relaxed">
          The browser extension stores its state (workspaces, collections, tabs, and a stable
          per-install identifier) in your browser&apos;s local IndexedDB. This data does not leave
          your device unless you opt into cloud sync.
        </p>
      </section>

      {/* 5. Data Retention */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">5. Data Retention</h2>
        <p className="text-muted-foreground leading-relaxed">
          We retain your synced data for as long as your account is active. After account
          termination, we retain your data for 30 days to allow data export, then permanently delete
          it. Soft-deleted entities (workspaces, collections, tabs you delete from the extension)
          are retained server-side briefly to support cross-device tombstone propagation and are
          then purged. We may retain certain operational records longer where required by law (e.g.,
          security logs, abuse-prevention data).
        </p>
      </section>

      {/* 6. Data Security */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">6. Data Security</h2>
        <p className="text-muted-foreground leading-relaxed">
          We implement appropriate technical and organizational measures to protect your data,
          including encryption in transit and at rest, scoped device tokens (server stores only a
          hash), and per-user query isolation. For more details, see our{" "}
          <Link to="/legal/security" className="text-primary hover:underline">
            Security
          </Link>{" "}
          page.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          While we strive to protect your data, no method of transmission or storage is completely
          secure. We cannot guarantee absolute security.
        </p>
      </section>

      {/* 7. Your Rights */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">7. Your Rights</h2>
        <p className="text-muted-foreground leading-relaxed">
          Depending on your jurisdiction, you may have the following rights regarding your personal
          data:
        </p>
        <ul className="list-disc space-y-1.5 pl-6 text-muted-foreground leading-relaxed">
          <li>
            <strong>Access</strong> — request a copy of the personal data we hold about you.
          </li>
          <li>
            <strong>Rectification</strong> — request correction of inaccurate data.
          </li>
          <li>
            <strong>Deletion</strong> — request deletion of your account and synced data.
          </li>
          <li>
            <strong>Portability</strong> — request your data in a machine-readable format. The
            extension also provides offline export functionality.
          </li>
          <li>
            <strong>Objection</strong> — object to certain processing activities.
          </li>
        </ul>
        <p className="text-muted-foreground leading-relaxed">
          To exercise these rights, contact us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
            {SUPPORT_EMAIL}
          </a>
          . We will respond within 30 days.
        </p>
      </section>

      {/* 8. International Transfers */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">8. International Transfers</h2>
        <p className="text-muted-foreground leading-relaxed">
          Your data may be processed at Cloudflare edge locations outside your country of residence.
          We rely on Cloudflare&apos;s data protection program and standard contractual clauses
          where applicable to safeguard cross-border transfers.
        </p>
      </section>

      {/* 9. Children's Privacy */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">9. Children&apos;s Privacy</h2>
        <p className="text-muted-foreground leading-relaxed">
          The Service is not directed at children under 13. We do not knowingly collect personal
          information from children under 13. If we discover that we have collected data from a
          child under 13, we will promptly delete it. If you believe a child has provided us with
          personal information, please contact us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>

      {/* 10. Changes to Policy */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">10. Changes to This Policy</h2>
        <p className="text-muted-foreground leading-relaxed">
          We may update this Privacy Policy from time to time. We will notify you of material
          changes by email or through a prominent notice within the Service at least 30 days before
          the changes take effect. The &quot;Effective date&quot; at the top reflects the latest
          revision.
        </p>
      </section>

      {/* 11. Contact */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">11. Contact Us</h2>
        <p className="text-muted-foreground leading-relaxed">
          If you have questions about this Privacy Policy or wish to exercise your data rights,
          please contact us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </div>
  );
}
