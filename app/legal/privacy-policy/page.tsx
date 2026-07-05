import Link from 'next/link';
import { ChevronLeft, Clock } from 'lucide-react';
import { LegalDocToc } from '@/components/legal/LegalDocToc';
import styles from '@/components/legal/legalDoc.module.css';

export const metadata = {
  title: 'Privacy Policy | NoteDoctorAI',
  description: 'Privacy Policy for NoteDoctorAi authorization readiness platform',
  robots: { index: true, follow: true },
};

const TOC_ITEMS = [
  { id: 's1', label: 'Introduction' },
  { id: 's2', label: 'Information We Collect' },
  { id: 's3', label: 'How We Use Your Information' },
  { id: 's4', label: 'HIPAA & Protected Health Information' },
  { id: 's5', label: 'Data Storage & Security' },
  { id: 's6', label: 'How We Share Your Information' },
  { id: 's7', label: 'Your Rights & Choices' },
  { id: 's8', label: 'Cookies & Tracking' },
  { id: 's9', label: "Children's Privacy" },
  { id: 's10', label: 'International Data Transfers' },
  { id: 's11', label: 'California Privacy Rights' },
  { id: 's12', label: 'European Privacy Rights' },
  { id: 's13', label: 'Changes to This Policy' },
  { id: 's14', label: 'Data Breach Notification' },
  { id: 's15', label: 'Contact Us' },
  { id: 's16', label: 'Consent' },
];

export default function PrivacyPage() {
  return (
    <div id="privacy-scroll" className={styles.page}>
      <div className={styles.backRow}>
        <Link href="/" className={styles.back}>
          <ChevronLeft />
          Back to Home
        </Link>
      </div>

      <div className={styles.wrap}>
        <LegalDocToc items={TOC_ITEMS} scrollRootId="privacy-scroll" />

        <main className={styles.doc}>
          <div className={styles.docHead}>
            <h1>Privacy Policy</h1>
            <span className={styles.updated}>
              <Clock />
              Last updated April 11, 2026
            </span>
          </div>

          <section className={styles.section} id="s1">
            <h2>
              <span className={styles.num}>1</span> Introduction
            </h2>
            <p>
              NoteDoctorAi (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed
              to protecting your privacy. This Privacy Policy explains how we collect, use, disclose,
              and safeguard your information when you use our Service.
            </p>
          </section>

          <section className={styles.section} id="s2">
            <h2>
              <span className={styles.num}>2</span> Information We Collect
            </h2>
            <h3>2.1 Information You Provide</h3>
            <ul>
              <li>
                <strong>Account Information:</strong> Name, email address, password
              </li>
              <li>
                <strong>Billing Information:</strong> Payment method details (processed by Stripe)
              </li>
              <li>
                <strong>Usage Data:</strong> Queries, documents uploaded, and interactions with the
                Service
              </li>
              <li>
                <strong>Profile Information:</strong> Optional information you choose to provide
              </li>
            </ul>
            <h3>2.2 Automatically Collected Information</h3>
            <ul>
              <li>
                <strong>Log Data:</strong> IP address, browser type, device information, access
                times
              </li>
              <li>
                <strong>Cookies:</strong> Session cookies, preference cookies, analytics cookies
              </li>
              <li>
                <strong>Usage Analytics:</strong> Feature usage, performance metrics, error logs
              </li>
            </ul>
            <h3>2.3 Information from Third Parties</h3>
            <ul>
              <li>
                <strong>Payment Processor:</strong> Stripe provides payment confirmation and
                subscription status
              </li>
              <li>
                <strong>Authentication:</strong> Supabase handles authentication and session
                management
              </li>
            </ul>
          </section>

          <section className={styles.section} id="s3">
            <h2>
              <span className={styles.num}>3</span> How We Use Your Information
            </h2>
            <p>We use your information to:</p>
            <ul>
              <li>Provide, maintain, and improve the Service</li>
              <li>Process payments and manage subscriptions</li>
              <li>Send service-related communications and updates</li>
              <li>Respond to your inquiries and support requests</li>
              <li>Monitor and analyze usage patterns and trends</li>
              <li>Detect, prevent, and address technical issues and security threats</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section className={styles.section} id="s4">
            <h2>
              <span className={styles.num}>4</span> HIPAA and Protected Health Information
            </h2>
            <h3>4.1 PHI Prohibition</h3>
            <div className={styles.callout}>
              <p>
                <strong>You must NOT submit Protected Health Information (PHI)</strong> to the
                Service. The Service is designed for de-identified, generic clinical information
                only.
              </p>
            </div>
            <ul>
              <li>The Service is designed for de-identified, generic clinical information only</li>
              <li>
                We are not a HIPAA Business Associate and do not sign Business Associate Agreements
              </li>
            </ul>
            <h3>4.2 Your Responsibility</h3>
            <ul>
              <li>You are solely responsible for ensuring HIPAA compliance</li>
              <li>You must de-identify all information before submitting to the Service</li>
              <li>We are not liable for any PHI you submit in violation of these terms</li>
            </ul>
          </section>

          <section className={styles.section} id="s5">
            <h2>
              <span className={styles.num}>5</span> Data Storage and Security
            </h2>
            <h3>5.1 Data Storage</h3>
            <ul>
              <li>Data is stored on secure servers provided by Supabase and other cloud providers</li>
              <li>We use industry-standard encryption for data in transit (TLS/SSL)</li>
              <li>Database encryption at rest is provided by our infrastructure partners</li>
            </ul>
            <h3>5.2 Security Measures</h3>
            <ul>
              <li>Multi-factor authentication options</li>
              <li>Regular security audits and vulnerability assessments</li>
              <li>Access controls and authentication requirements</li>
              <li>Monitoring for unauthorized access</li>
            </ul>
            <h3>5.3 Data Retention</h3>
            <ul>
              <li>Account data is retained while your account is active</li>
              <li>Usage data may be retained for analytics and service improvement</li>
              <li>Upon account deletion, we delete or anonymize your data within 90 days</li>
              <li>Some data may be retained longer as required by law</li>
            </ul>
          </section>

          <section className={styles.section} id="s6">
            <h2>
              <span className={styles.num}>6</span> How We Share Your Information
            </h2>
            <h3>6.1 Service Providers</h3>
            <p>
              We share information with third-party service providers who perform services on our
              behalf:
            </p>
            <ul>
              <li>
                <strong>Stripe:</strong> Payment processing
              </li>
              <li>
                <strong>Supabase:</strong> Database and authentication
              </li>
              <li>
                <strong>OpenAI:</strong> AI model processing (de-identified queries only)
              </li>
              <li>
                <strong>Cloud Infrastructure:</strong> Hosting and storage providers
              </li>
            </ul>
            <h3>6.2 Legal Requirements</h3>
            <p>We may disclose information if required to:</p>
            <ul>
              <li>Comply with legal obligations, court orders, or subpoenas</li>
              <li>Protect our rights, property, or safety</li>
              <li>Investigate fraud or security issues</li>
              <li>Enforce our Terms of Service</li>
            </ul>
            <h3>6.3 Business Transfers</h3>
            <ul>
              <li>
                In the event of a merger, acquisition, or sale of assets, your information may be
                transferred to the acquiring entity
              </li>
            </ul>
            <h3>6.4 With Your Consent</h3>
            <ul>
              <li>We may share information for other purposes with your explicit consent</li>
            </ul>
          </section>

          <section className={styles.section} id="s7">
            <h2>
              <span className={styles.num}>7</span> Your Rights and Choices
            </h2>
            <h3>7.1 Access and Correction</h3>
            <ul>
              <li>You can access and update your account information through account settings</li>
              <li>You can request a copy of your data by contacting us</li>
            </ul>
            <h3>7.2 Data Deletion</h3>
            <ul>
              <li>You can delete your account at any time through account settings</li>
              <li>You can request deletion of specific data by contacting us</li>
            </ul>
            <h3>7.3 Marketing Communications</h3>
            <ul>
              <li>You can opt out of marketing emails via the unsubscribe link</li>
              <li>
                Service-related communications cannot be opted out of while using the Service
              </li>
            </ul>
            <h3>7.4 Cookies</h3>
            <ul>
              <li>You can control cookies through your browser settings</li>
              <li>Disabling cookies may affect Service functionality</li>
            </ul>
          </section>

          <section className={styles.section} id="s8">
            <h2>
              <span className={styles.num}>8</span> Cookies and Tracking Technologies
            </h2>
            <h3>8.1 Types of Cookies</h3>
            <ul>
              <li>
                <strong>Essential Cookies:</strong> Required for Service functionality
              </li>
              <li>
                <strong>Analytics Cookies:</strong> Help us understand how you use the Service
              </li>
              <li>
                <strong>Preference Cookies:</strong> Remember your settings and preferences
              </li>
            </ul>
            <h3>8.2 Third-Party Cookies</h3>
            <ul>
              <li>Analytics providers (e.g., Google Analytics) may set cookies</li>
              <li>
                You can opt out of third-party analytics through browser settings or opt-out tools
              </li>
            </ul>
          </section>

          <section className={styles.section} id="s9">
            <h2>
              <span className={styles.num}>9</span> Children&rsquo;s Privacy
            </h2>
            <p>
              The Service is not intended for users under 18 years of age. We do not knowingly
              collect information from children. If we learn we have collected information from a
              child, we will delete it promptly.
            </p>
          </section>

          <section className={styles.section} id="s10">
            <h2>
              <span className={styles.num}>10</span> International Data Transfers
            </h2>
            <p>
              Your information may be transferred to and processed in countries other than your
              country of residence. We ensure appropriate safeguards are in place for such transfers.
            </p>
          </section>

          <section className={styles.section} id="s11">
            <h2>
              <span className={styles.num}>11</span> California Privacy Rights
            </h2>
            <p>
              If you are a California resident, you have additional rights under the California
              Consumer Privacy Act (CCPA):
            </p>
            <ul>
              <li>Right to know what personal information is collected</li>
              <li>Right to know if personal information is sold or disclosed</li>
              <li>
                Right to opt out of the sale of personal information (we do not sell personal
                information)
              </li>
              <li>Right to request deletion of personal information</li>
              <li>Right to non-discrimination for exercising your rights</li>
            </ul>
            <p>
              To exercise these rights, contact us at{' '}
              <a href="mailto:sales@notedoctor.ai">sales@notedoctor.ai</a>.
            </p>
          </section>

          <section className={styles.section} id="s12">
            <h2>
              <span className={styles.num}>12</span> European Privacy Rights
            </h2>
            <p>
              If you are in the European Economic Area (EEA), you have rights under the General Data
              Protection Regulation (GDPR):
            </p>
            <ul>
              <li>Right of access to your personal data</li>
              <li>Right to rectification of inaccurate data</li>
              <li>Right to erasure (&ldquo;right to be forgotten&rdquo;)</li>
              <li>Right to restrict processing</li>
              <li>Right to data portability</li>
              <li>Right to object to processing</li>
              <li>Right to withdraw consent</li>
            </ul>
            <p>
              To exercise these rights, contact us at{' '}
              <a href="mailto:sales@notedoctor.ai">sales@notedoctor.ai</a>.
            </p>
          </section>

          <section className={styles.section} id="s13">
            <h2>
              <span className={styles.num}>13</span> Changes to This Privacy Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material
              changes by:
            </p>
            <ul>
              <li>Posting the updated policy on the Service</li>
              <li>Sending an email to your registered email address</li>
              <li>Displaying a notice on the Service</li>
            </ul>
            <p>
              Your continued use of the Service after changes constitutes acceptance of the updated
              Privacy Policy.
            </p>
          </section>

          <section className={styles.section} id="s14">
            <h2>
              <span className={styles.num}>14</span> Data Breach Notification
            </h2>
            <p>
              In the event of a data breach that affects your personal information, we will notify
              you and relevant authorities as required by applicable law.
            </p>
          </section>

          <section className={styles.section} id="s15">
            <h2>
              <span className={styles.num}>15</span> Contact Us
            </h2>
            <p>
              For questions or concerns about this Privacy Policy or our data practices, please
              contact us:
            </p>
            <ul>
              <li>
                <strong>Email:</strong>{' '}
                <a href="mailto:sales@notedoctor.ai">sales@notedoctor.ai</a>
              </li>
              <li>
                <strong>Support:</strong>{' '}
                <a href="mailto:sales@notedoctor.ai">sales@notedoctor.ai</a>
              </li>
            </ul>
          </section>

          <section className={styles.section} id="s16">
            <h2>
              <span className={styles.num}>16</span> Consent
            </h2>
            <p>
              By using the Service, you consent to the collection, use, and sharing of your
              information as described in this Privacy Policy.
            </p>
          </section>

          <div className={styles.docFoot}>
            <p>
              Effective Date: April 11, 2026. This Privacy Policy was last updated on the date
              indicated above. Please review it periodically for any changes.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}