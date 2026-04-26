import { Link } from "react-router";
import { SUPPORT_EMAIL } from "~/lib/external-links";
import { getPageTitle } from "~/lib/utils";
import type { Route } from "./+types/terms";

export function meta() {
  return [{ title: getPageTitle("Terms of Service") }];
}

export default function TermsRoute(_: Route.ComponentProps) {
  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="space-y-3 border-border border-b pb-8">
        <h1 className="font-bold text-3xl tracking-tight">Terms of Service</h1>
        <p className="text-muted-foreground text-sm">Effective date: April 26, 2026</p>
        <p className="text-muted-foreground leading-relaxed">
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of the OpenTab
          browser extension and the OpenTab Cloud sync service (collectively, the
          &quot;Service&quot;). By installing the extension or signing in to OpenTab Cloud, you
          agree to be bound by these Terms.
        </p>
      </header>

      {/* 1. Agreement to Terms */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">1. Agreement to Terms</h2>
        <p className="text-muted-foreground leading-relaxed">
          By installing the extension, creating an account, or using the Service, you confirm that
          you have read, understood, and agree to be bound by these Terms and our{" "}
          <Link to="/legal/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          . If you are using the Service on behalf of an organization, you represent that you have
          the authority to bind that organization to these Terms.
        </p>
      </section>

      {/* 2. Description of Service */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">2. Description of Service</h2>
        <p className="text-muted-foreground leading-relaxed">
          OpenTab is a browser tab management tool. The extension lets you organize browser tabs
          into workspaces and collections, save and restore tab groups, and search your saved tabs.
          OpenTab Cloud is an optional companion service that synchronizes your workspaces,
          collections, and tabs across the devices you choose to connect.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          OpenTab is local-first: the extension works fully offline. Cloud sync is opt-in.
        </p>
      </section>

      {/* 3. Account Registration & Eligibility */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">3. Account Registration &amp; Eligibility</h2>
        <p className="text-muted-foreground leading-relaxed">To use OpenTab Cloud, you must:</p>
        <ul className="list-disc space-y-1.5 pl-6 text-muted-foreground leading-relaxed">
          <li>Be at least 13 years old (or the legal age of majority in your jurisdiction).</li>
          <li>Provide an accurate email address and authentication credentials.</li>
          <li>Maintain the security of your account and connected devices.</li>
          <li>Promptly notify us of any unauthorized use of your account.</li>
        </ul>
        <p className="text-muted-foreground leading-relaxed">
          You are responsible for all activities that occur under your account. We reserve the right
          to suspend or terminate accounts that violate these Terms.
        </p>
      </section>

      {/* 4. Pricing */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">4. Pricing</h2>
        <p className="text-muted-foreground leading-relaxed">
          The browser extension is free. OpenTab Cloud is currently provided free of charge during
          its public preview period. We reserve the right to introduce paid plans in the future; if
          we do, we will provide reasonable advance notice and you may continue to use the extension
          without cloud sync at no cost.
        </p>
      </section>

      {/* 5. Intellectual Property */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">5. Intellectual Property</h2>
        <p className="text-muted-foreground leading-relaxed">
          The Service, including its design, features, code, and documentation, is owned by OpenTab
          and protected by intellectual property laws. You are granted a limited, non-exclusive,
          non-transferable license to use the Service for its intended purpose.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          You retain all rights to the data and content you save into the Service. By using cloud
          sync, you grant us a limited license to process that data solely to provide and improve
          the Service.
        </p>
      </section>

      {/* 6. User Data & Privacy */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">6. User Data &amp; Privacy</h2>
        <p className="text-muted-foreground leading-relaxed">
          We take your privacy seriously. Our collection, use, and protection of your personal data
          is governed by our{" "}
          <Link to="/legal/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          , which is incorporated into these Terms by reference. By using the Service, you consent
          to the data practices described therein.
        </p>
      </section>

      {/* 7. Acceptable Use */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">7. Acceptable Use</h2>
        <p className="text-muted-foreground leading-relaxed">
          You agree not to use the Service to:
        </p>
        <ul className="list-disc space-y-1.5 pl-6 text-muted-foreground leading-relaxed">
          <li>Violate any applicable laws, regulations, or third-party rights.</li>
          <li>Upload or distribute malicious code, malware, or harmful content.</li>
          <li>
            Attempt to reverse engineer, decompile, or disassemble any part of the Service beyond
            what is permitted by applicable open-source licenses.
          </li>
          <li>Interfere with or disrupt the integrity or performance of the Service.</li>
          <li>
            Access the Service through automated means (bots, scrapers) or generate excessive load
            in violation of stated rate limits.
          </li>
          <li>
            Use the Service to store or distribute content that infringes copyright or other rights.
          </li>
        </ul>
      </section>

      {/* 8. Service Availability */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">8. Service Availability</h2>
        <p className="text-muted-foreground leading-relaxed">
          We strive to maintain high availability of OpenTab Cloud but do not guarantee
          uninterrupted or error-free operation. The Service may be temporarily unavailable due to
          maintenance, upgrades, or circumstances beyond our control. The browser extension is
          designed to keep working offline so cloud unavailability does not block your local use.
        </p>
      </section>

      {/* 9. Limitation of Liability */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">9. Limitation of Liability</h2>
        <p className="text-muted-foreground leading-relaxed">
          To the maximum extent permitted by law, OpenTab shall not be liable for any indirect,
          incidental, special, consequential, or punitive damages, including but not limited to loss
          of profits, data, or business opportunities, arising out of or in connection with your use
          of the Service.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          Our total cumulative liability for any claims arising from or related to these Terms or
          the Service shall not exceed the amount you paid to us in the twelve (12) months preceding
          the claim, or USD 100, whichever is greater.
        </p>
      </section>

      {/* 10. Indemnification */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">10. Indemnification</h2>
        <p className="text-muted-foreground leading-relaxed">
          You agree to indemnify, defend, and hold harmless OpenTab, its officers, directors,
          employees, and agents from any claims, damages, losses, liabilities, and expenses
          (including reasonable legal fees) arising out of your use of the Service, violation of
          these Terms, or infringement of any third-party rights.
        </p>
      </section>

      {/* 11. Termination */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">11. Termination</h2>
        <p className="text-muted-foreground leading-relaxed">
          You may stop using the extension or close your cloud account at any time. Upon termination
          of cloud access:
        </p>
        <ul className="list-disc space-y-1.5 pl-6 text-muted-foreground leading-relaxed">
          <li>
            We will retain your data for 30 days, during which you may export your data via the
            extension or contact support to request a copy.
          </li>
          <li>After the 30-day retention period, your synced data will be permanently deleted.</li>
          <li>
            Your local extension data continues to live on your devices and is unaffected by cloud
            termination.
          </li>
        </ul>
        <p className="text-muted-foreground leading-relaxed">
          We may suspend or terminate your access immediately if you breach these Terms or engage in
          conduct that we determine is harmful to the Service or other users.
        </p>
      </section>

      {/* 12. Governing Law */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">12. Governing Law &amp; Dispute Resolution</h2>
        <p className="text-muted-foreground leading-relaxed">
          These Terms shall be governed by and construed in accordance with the laws of the Hong
          Kong Special Administrative Region. Any disputes arising from these Terms or the Service
          shall be subject to the exclusive jurisdiction of the courts of Hong Kong, except where
          mandatory consumer-protection laws of your jurisdiction provide otherwise.
        </p>
      </section>

      {/* 13. Changes to Terms */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">13. Changes to Terms</h2>
        <p className="text-muted-foreground leading-relaxed">
          We reserve the right to modify these Terms at any time. We will notify you of material
          changes by email or through a prominent notice within the Service at least 30 days before
          the changes take effect. Your continued use of the Service after the effective date
          constitutes acceptance of the updated Terms.
        </p>
      </section>

      {/* 14. Contact */}
      <section className="space-y-3">
        <h2 className="font-semibold text-xl">14. Contact Information</h2>
        <p className="text-muted-foreground leading-relaxed">
          If you have any questions about these Terms, please contact us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </div>
  );
}
