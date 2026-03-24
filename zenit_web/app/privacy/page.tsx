import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/page/landing-page";
import LandingFooter from "@/components/page/landing-page/LandingFooter";

export const metadata: Metadata = {
	title: "Privacy Policy - Zenit",
	description:
		"Privacy Policy for Zenit - Market Insights & On-chain Analysis Platform",
};

export default function PrivacyPage() {
	return (
		<div className="landing-page-container lg:px-10 px-4">
			<Header />
			<div className="mx-auto px-6 py-10 text-gray-300 font-sans">
			<h1 className="text-3xl font-bold text-white mb-2">
				Privacy Policy
			</h1>
			<p className="text-sm text-gray-500 mb-8">
				Last updated: February 24, 2026
			</p>

			<div className="space-y-8 text-sm leading-relaxed">
				<section>
					<h2 className="text-lg font-semibold text-white mb-3">
						1. Introduction
					</h2>
					<p>
						Zenit (&quot;Company&quot;, &quot;we&quot;,
						&quot;us&quot;, or &quot;our&quot;) respects your
						privacy and is committed to protecting your personal
						data. This Privacy Policy explains how we collect, use,
						disclose, and safeguard your information when you use
						the Zenit application and website (collectively, the
						&quot;Service&quot;).
					</p>
					<p className="mt-2">
						By using the Service, you consent to the data practices
						described in this policy. If you do not agree with the
						terms of this Privacy Policy, please do not access or
						use the Service.
					</p>
				</section>

				<section>
					<h2 className="text-lg font-semibold text-white mb-3">
						2. Information We Collect
					</h2>

					<h3 className="text-base font-medium text-gray-200 mt-4 mb-2">
						2.1 Information You Provide
					</h3>
					<ul className="list-disc list-inside space-y-1 ml-4">
						<li>
							Wallet addresses when you connect your cryptocurrency
							wallet to the Service
						</li>
						<li>
							Communications and feedback you send to us (e.g.,
							support requests, emails)
						</li>
						<li>
							Preferences and settings you configure within the
							Service
						</li>
					</ul>

					<h3 className="text-base font-medium text-gray-200 mt-4 mb-2">
						2.2 Information Collected Automatically
					</h3>
					<ul className="list-disc list-inside space-y-1 ml-4">
						<li>
							Device information (device type, operating system,
							browser type and version)
						</li>
						<li>
							Usage data (pages visited, features used, time
							spent on the Service)
						</li>
						<li>
							IP address and approximate geographic location
						</li>
						<li>
							Log data (access times, error logs, referring URLs)
						</li>
						<li>
							Cookies and similar tracking technologies
						</li>
					</ul>

					<h3 className="text-base font-medium text-gray-200 mt-4 mb-2">
						2.3 Blockchain Data
					</h3>
					<p>
						When you connect a wallet or interact with blockchain
						services through our platform, we may access publicly
						available on-chain data associated with your wallet
						address, including transaction history, token balances,
						and smart contract interactions. This data is publicly
						available on the blockchain and is not collected by us
						directly.
					</p>
				</section>

				<section>
					<h2 className="text-lg font-semibold text-white mb-3">
						3. How We Use Your Information
					</h2>
					<p>We use the information we collect to:</p>
					<ul className="list-disc list-inside mt-2 space-y-1 ml-4">
						<li>Provide, operate, and maintain the Service</li>
						<li>
							Improve, personalize, and expand the Service
						</li>
						<li>
							Understand and analyze how you use the Service
						</li>
						<li>
							Develop new products, services, features, and
							functionality
						</li>
						<li>
							Communicate with you, including for customer
							service, updates, and marketing (with your consent)
						</li>
						<li>Detect, prevent, and address technical issues</li>
						<li>
							Protect against fraudulent, unauthorized, or
							illegal activity
						</li>
						<li>
							Comply with legal obligations and enforce our
							Terms of Service
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-lg font-semibold text-white mb-3">
						4. Sharing of Information
					</h2>
					<p>
						We do not sell your personal information. We may share
						your information in the following circumstances:
					</p>
					<ul className="list-disc list-inside mt-2 space-y-1 ml-4">
						<li>
							<strong className="text-gray-200">Service Providers:</strong>{" "}
							With third-party vendors who assist us in operating
							the Service (hosting, analytics, customer support)
						</li>
						<li>
							<strong className="text-gray-200">Legal Requirements:</strong>{" "}
							When required by law, regulation, legal process, or
							governmental request
						</li>
						<li>
							<strong className="text-gray-200">Protection of Rights:</strong>{" "}
							To protect the rights, property, or safety of
							Zenit, our users, or the public
						</li>
						<li>
							<strong className="text-gray-200">Business Transfers:</strong>{" "}
							In connection with a merger, acquisition, or sale of
							assets, your information may be transferred as part
							of that transaction
						</li>
						<li>
							<strong className="text-gray-200">With Your Consent:</strong>{" "}
							When you have given us explicit consent to share
							your information
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-lg font-semibold text-white mb-3">
						5. Data Security
					</h2>
					<p>
						We implement appropriate technical and organizational
						security measures to protect your personal information
						against unauthorized access, alteration, disclosure, or
						destruction. However, no method of transmission over
						the Internet or electronic storage is 100% secure, and
						we cannot guarantee absolute security.
					</p>
				</section>

				<section>
					<h2 className="text-lg font-semibold text-white mb-3">
						6. Data Retention
					</h2>
					<p>
						We retain your personal information only for as long as
						necessary to fulfill the purposes for which it was
						collected, including to satisfy legal, accounting, or
						reporting requirements. When your information is no
						longer needed, we will securely delete or anonymize it.
					</p>
				</section>

				<section>
					<h2 className="text-lg font-semibold text-white mb-3">
						7. Your Rights
					</h2>
					<p>
						Depending on your location, you may have the following
						rights regarding your personal data:
					</p>
					<ul className="list-disc list-inside mt-2 space-y-1 ml-4">
						<li>
							<strong className="text-gray-200">Access:</strong>{" "}
							Request a copy of the personal data we hold about
							you
						</li>
						<li>
							<strong className="text-gray-200">Correction:</strong>{" "}
							Request correction of inaccurate or incomplete
							personal data
						</li>
						<li>
							<strong className="text-gray-200">Deletion:</strong>{" "}
							Request deletion of your personal data, subject to
							certain exceptions
						</li>
						<li>
							<strong className="text-gray-200">Objection:</strong>{" "}
							Object to the processing of your personal data for
							certain purposes
						</li>
						<li>
							<strong className="text-gray-200">Portability:</strong>{" "}
							Request transfer of your personal data in a
							structured, machine-readable format
						</li>
						<li>
							<strong className="text-gray-200">Withdraw Consent:</strong>{" "}
							Withdraw your consent at any time where we rely on
							consent to process your data
						</li>
					</ul>
					<p className="mt-2">
						To exercise any of these rights, please contact us using
						the information provided below.
					</p>
				</section>

				<section>
					<h2 className="text-lg font-semibold text-white mb-3">
						8. Cookies and Tracking Technologies
					</h2>
					<p>
						We use cookies and similar tracking technologies to
						collect and use information about you and your
						interaction with the Service. Cookies are small data
						files stored on your device. You can control the use of
						cookies through your browser settings. Please note that
						disabling cookies may affect the functionality of the
						Service.
					</p>
					<p className="mt-2">We use the following types of cookies:</p>
					<ul className="list-disc list-inside mt-2 space-y-1 ml-4">
						<li>
							<strong className="text-gray-200">Essential Cookies:</strong>{" "}
							Required for the operation of the Service
						</li>
						<li>
							<strong className="text-gray-200">Analytics Cookies:</strong>{" "}
							Help us understand how users interact with the
							Service
						</li>
						<li>
							<strong className="text-gray-200">Preference Cookies:</strong>{" "}
							Remember your settings and preferences
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-lg font-semibold text-white mb-3">
						9. Third-Party Services
					</h2>
					<p>
						The Service may contain links to third-party websites
						or services that are not operated by us. We have no
						control over and assume no responsibility for the
						content, privacy policies, or practices of any
						third-party services. We encourage you to review the
						privacy policies of any third-party services you access
						through our Service.
					</p>
				</section>

				<section>
					<h2 className="text-lg font-semibold text-white mb-3">
						10. Children&apos;s Privacy
					</h2>
					<p>
						The Service is not intended for individuals under the
						age of 18. We do not knowingly collect personal
						information from children under 18. If we become aware
						that we have collected personal data from a child under
						18, we will take steps to delete such information
						promptly. If you believe a child under 18 has provided
						us with personal data, please contact us.
					</p>
				</section>

				<section>
					<h2 className="text-lg font-semibold text-white mb-3">
						11. International Data Transfers
					</h2>
					<p>
						Your information may be transferred to and maintained
						on servers located outside of your state, province,
						country, or other governmental jurisdiction where data
						protection laws may differ. By using the Service, you
						consent to the transfer of your information to Vietnam
						and other locations where we operate.
					</p>
				</section>

				<section>
					<h2 className="text-lg font-semibold text-white mb-3">
						12. Changes to This Privacy Policy
					</h2>
					<p>
						We may update this Privacy Policy from time to time. The
						updated version will be indicated by the &quot;Last
						updated&quot; date at the top of this page. We encourage
						you to review this Privacy Policy periodically for any
						changes. Changes are effective when posted on this page.
					</p>
				</section>

				<section>
					<h2 className="text-lg font-semibold text-white mb-3">
						13. Contact Us
					</h2>
					<p>
						If you have any questions or concerns about this
						Privacy Policy or our data practices, please contact us
						at:
					</p>
					<ul className="mt-2 space-y-1 ml-4">
						<li>
							Email:{" "}
							<a
								href="mailto:nploc101999@gmail.com"
								className="text-blue-400 hover:underline"
							>
								nploc101999@gmail.com
							</a>
						</li>
						<li>
							Address: 2 Vuong Thua Vu street, Ha Noi, 100000,
							Vietnam
						</li>
					</ul>
				</section>
			</div>

			</div>
			<LandingFooter />
		</div>
	);
}
