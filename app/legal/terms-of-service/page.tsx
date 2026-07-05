import Link from 'next/link';
import { ChevronLeft, Clock } from 'lucide-react';
import { LegalDocToc } from '@/components/legal/LegalDocToc';
import styles from '@/components/legal/legalDoc.module.css';

export const metadata = {
  title: 'Terms of Service | NoteDoctorAI',
  description: 'Terms of Service for NoteDoctorAi authorization readiness platform',
  robots: { index: true, follow: true },
};

const TOC_ITEMS = [
  { id: 's1', label: 'Acceptance of Terms' },
  { id: 's2', label: 'Description of Service' },
  { id: 's3', label: 'User Accounts' },
  { id: 's4', label: 'Subscription & Payment' },
  { id: 's5', label: 'HIPAA Compliance & Data Use' },
  { id: 's6', label: 'Acceptable Use' },
  { id: 's7', label: 'Intellectual Property' },
  { id: 's8', label: 'Disclaimers' },
  { id: 's9', label: 'Limitation of Liability' },
  { id: 's10', label: 'Indemnification' },
  { id: 's11', label: 'Modifications to Terms' },
  { id: 's12', label: 'Termination' },
  { id: 's13', label: 'Governing Law' },
  { id: 's14', label: 'Dispute Resolution' },
  { id: 's15', label: 'General Provisions' },
  { id: 's16', label: 'Contact Information' },
];

export default function TermsPage() {
  return (
    <div id="tos-scroll" className={styles.page}>
      <div className={styles.backRow}>
        <Link href="/" className={styles.back}>
          <ChevronLeft />
          Back to Home
        </Link>
      </div>

      <div className={styles.wrap}>
        <LegalDocToc items={TOC_ITEMS} scrollRootId="tos-scroll" />

        <main className={styles.doc}>
          <div className={styles.docHead}>
            <h1>Terms of Service</h1>
            <span className={styles.updated}>
              <Clock />
              Last updated April 11, 2026
            </span>
          </div>

          <section className={styles.section} id="s1">
            <h2>
              <span className={styles.num}>1</span> Acceptance of Terms
            </h2>
            <p>
              By accessing or using NoteDoctorAi (the &ldquo;Service&rdquo;), you agree to be
              bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree to these
              Terms, you may not access or use the Service.
            </p>
          </section>

          <section className={styles.section} id="s2">
            <h2>
              <span className={styles.num}>2</span> Description of Service
            </h2>
            <p>
              NoteDoctorAi provides authorization readiness analysis and documentation review
              tools for healthcare professionals. The Service assists with prior authorization
              workflows but does not replace professional medical judgment or guarantee
              authorization approval.
            </p>
          </section>

          <section className={styles.section} id="s3">
            <h2>
              <span className={styles.num}>3</span> User Accounts
            </h2>
            <h3>3.1 Account Creation</h3>
            <ul>
              <li>You must provide accurate and complete information when creating an account</li>
              <li>
                You are responsible for maintaining the confidentiality of your account credentials
              </li>
              <li>You must be at least 18 years old to use the Service</li>
            </ul>
            <h3>3.2 Account Security</h3>
            <ul>
              <li>You are responsible for all activities that occur under your account</li>
              <li>You must notify us immediately of any unauthorized use of your account</li>
              <li>We reserve the right to suspend or terminate accounts that violate these Terms</li>
            </ul>
          </section>

          <section className={styles.section} id="s4">
            <h2>
              <span className={styles.num}>4</span> Subscription and Payment
            </h2>
            <h3>4.1 Subscription Plans</h3>
            <ul>
              <li>The Service is provided on a subscription basis</li>
              <li>Subscription fees are billed in advance on a recurring basis</li>
              <li>All fees are non-refundable except as required by law</li>
            </ul>
            <h3>4.2 Payment Terms</h3>
            <ul>
              <li>You authorize us to charge your payment method for all fees</li>
              <li>You must provide current, complete, and accurate billing information</li>
              <li>Failure to pay may result in suspension or termination of your account</li>
            </ul>
            <h3>4.3 Cancellation</h3>
            <ul>
              <li>You may cancel your subscription at any time</li>
              <li>Cancellation takes effect at the end of the current billing period</li>
              <li>No refunds will be provided for partial billing periods</li>
            </ul>
          </section>

          <section className={styles.section} id="s5">
            <h2>
              <span className={styles.num}>5</span> HIPAA Compliance and Data Use
            </h2>
            <h3>5.1 Protected Health Information (PHI)</h3>
            <div className={styles.callout}>
              <p>
                <strong>DO NOT</strong> enter patient-specific PHI including names, dates of birth,
                medical record numbers, or other identifying information.
              </p>
            </div>
            <ul>
              <li>Use only generic descriptions and de-identified information</li>
              <li>
                You are solely responsible for ensuring HIPAA compliance in your use of the Service
              </li>
            </ul>
            <h3>5.2 Data Processing</h3>
            <ul>
              <li>We process data solely to provide the Service</li>
              <li>We implement appropriate security measures to protect your data</li>
              <li>We do not sell or share your data with third parties for marketing purposes</li>
            </ul>
          </section>

          <section className={styles.section} id="s6">
            <h2>
              <span className={styles.num}>6</span> Acceptable Use
            </h2>
            <p>
              You agree <strong>NOT</strong> to:
            </p>
            <ul>
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe on intellectual property rights</li>
              <li>Upload malicious code or attempt to compromise the Service</li>
              <li>Use the Service for any unlawful or fraudulent purpose</li>
              <li>Share your account credentials with others</li>
              <li>Attempt to reverse engineer or extract source code from the Service</li>
            </ul>
          </section>

          <section className={styles.section} id="s7">
            <h2>
              <span className={styles.num}>7</span> Intellectual Property
            </h2>
            <h3>7.1 Service Content</h3>
            <ul>
              <li>
                The Service and its content are protected by copyright, trademark, and other laws
              </li>
              <li>
                We grant you a limited, non-exclusive, non-transferable license to use the Service
              </li>
              <li>
                You may not copy, modify, distribute, or create derivative works from the Service
              </li>
            </ul>
            <h3>7.2 User Content</h3>
            <ul>
              <li>You retain ownership of content you submit to the Service</li>
              <li>You grant us a license to use your content solely to provide the Service</li>
              <li>You represent that you have the right to submit all content you provide</li>
            </ul>
          </section>

          <section className={styles.section} id="s8">
            <h2>
              <span className={styles.num}>8</span> Disclaimers
            </h2>
            <h3>8.1 No Medical Advice</h3>
            <ul>
              <li>The Service provides information tools only</li>
              <li>The Service does not provide medical advice, diagnosis, or treatment</li>
              <li>Always verify information with payer portal guidelines before submission</li>
            </ul>
            <h3>8.2 No Guarantees</h3>
            <ul>
              <li>We do not guarantee authorization approval or specific outcomes</li>
              <li>The Service is provided &ldquo;as is&rdquo; without warranties of any kind</li>
              <li>We do not warrant that the Service will be uninterrupted or error-free</li>
            </ul>
          </section>

          <section className={styles.section} id="s9">
            <h2>
              <span className={styles.num}>9</span> Limitation of Liability
            </h2>
            <div className={styles.legalbox}>To the maximum extent permitted by law:</div>
            <ul>
              <li>We are not liable for any indirect, incidental, or consequential damages</li>
              <li>
                Our total liability shall not exceed the fees you paid in the 12 months preceding
                the claim
              </li>
              <li>
                Some jurisdictions do not allow limitation of liability, so these limitations may
                not apply to you
              </li>
            </ul>
          </section>

          <section className={styles.section} id="s10">
            <h2>
              <span className={styles.num}>10</span> Indemnification
            </h2>
            <p>
              You agree to indemnify and hold us harmless from any claims, damages, or expenses
              arising from:
            </p>
            <ul>
              <li>Your use of the Service</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any rights of another party</li>
            </ul>
          </section>

          <section className={styles.section} id="s11">
            <h2>
              <span className={styles.num}>11</span> Modifications to Terms
            </h2>
            <ul>
              <li>We may modify these Terms at any time</li>
              <li>We will provide notice of material changes via email or through the Service</li>
              <li>
                Continued use of the Service after changes constitutes acceptance of the modified
                Terms
              </li>
            </ul>
          </section>

          <section className={styles.section} id="s12">
            <h2>
              <span className={styles.num}>12</span> Termination
            </h2>
            <h3>12.1 By You</h3>
            <ul>
              <li>You may terminate your account at any time through account settings</li>
            </ul>
            <h3>12.2 By Us</h3>
            <ul>
              <li>We may suspend or terminate your account for violation of these Terms</li>
              <li>We may terminate the Service at any time with 30 days&rsquo; notice</li>
            </ul>
            <h3>12.3 Effect of Termination</h3>
            <ul>
              <li>Upon termination, your right to use the Service ceases immediately</li>
              <li>We may delete your data in accordance with our data retention policies</li>
            </ul>
          </section>

          <section className={styles.section} id="s13">
            <h2>
              <span className={styles.num}>13</span> Governing Law
            </h2>
            <p>
              These Terms are governed by the laws of the United States, without regard to conflict
              of law provisions.
            </p>
          </section>

          <section className={styles.section} id="s14">
            <h2>
              <span className={styles.num}>14</span> Dispute Resolution
            </h2>
            <h3>14.1 Informal Resolution</h3>
            <ul>
              <li>
                Before filing a claim, you agree to contact us to attempt informal resolution
              </li>
            </ul>
            <h3>14.2 Arbitration</h3>
            <ul>
              <li>Any disputes shall be resolved through binding arbitration</li>
              <li>You waive the right to participate in class actions</li>
            </ul>
          </section>

          <section className={styles.section} id="s15">
            <h2>
              <span className={styles.num}>15</span> General Provisions
            </h2>
            <h3>15.1 Entire Agreement</h3>
            <ul>
              <li>These Terms constitute the entire agreement between you and us</li>
            </ul>
            <h3>15.2 Severability</h3>
            <ul>
              <li>
                If any provision is found unenforceable, the remaining provisions remain in effect
              </li>
            </ul>
            <h3>15.3 Waiver</h3>
            <ul>
              <li>Failure to enforce any provision does not constitute a waiver</li>
            </ul>
            <h3>15.4 Assignment</h3>
            <ul>
              <li>You may not assign these Terms without our consent</li>
              <li>We may assign these Terms to any successor or affiliate</li>
            </ul>
          </section>

          <section className={styles.section} id="s16">
            <h2>
              <span className={styles.num}>16</span> Contact Information
            </h2>
            <p>For questions about these Terms, please contact us at:</p>
            <ul>
              <li>
                Email: <a href="mailto:sales@notedoctor.ai">sales@notedoctor.ai</a>
              </li>
            </ul>
          </section>

          <div className={styles.docFoot}>
            <p>
              By using the Service, you acknowledge that you have read, understood, and agree to be
              bound by these Terms of Service.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}