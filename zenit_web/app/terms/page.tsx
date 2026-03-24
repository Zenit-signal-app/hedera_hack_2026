import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/page/landing-page";
import LandingFooter from "@/components/page/landing-page/LandingFooter";

export const metadata: Metadata = {
	title: "Terms of Service - Zenit",
	description:
		"Terms of Service for Zenit - Market Insights & On-chain Analysis Platform",
};

export default function TermsPage() {
	return (
		<div className="landing-page-container lg:px-10 px-4">
			<Header />
			<div className="mx-auto px-6 py-10 text-gray-300 font-sans">
				<h1 className="text-3xl font-bold text-white mb-2">
					Terms of Service
				</h1>
				<p className="text-sm text-gray-500 mb-8">
					Last updated: February 24, 2026
				</p>

				<div className="space-y-8 text-sm leading-relaxed">
					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							1. Agreement to Terms
						</h2>
						<p>
							By accessing or using the Zenit application and
							website (collectively, the &quot;Service&quot;), you
							agree to be bound by these Terms of Service
							(&quot;Terms&quot;). If you do not agree to these
							Terms, you may not access or use the Service.
						</p>
						<p className="mt-2">
							These Terms constitute a legally binding agreement
							between you and Zenit (&quot;Company&quot;,
							&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;)
							regarding your use of the Service.
						</p>
					</section>

					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							2. Description of Service
						</h2>
						<p>
							Zenit is a market insights and on-chain analysis
							platform that provides:
						</p>
						<ul className="list-disc list-inside mt-2 space-y-1 ml-4">
							<li>
								Real-time market data, charts, and analysis
								tools
							</li>
							<li>
								AI-powered trading assistant and market insights
							</li>
							<li>
								On-chain data visualization and trend analysis
							</li>
							<li>Portfolio tracking and management features</li>
							<li>Asset vault and DeFi integration services</li>
						</ul>
						<p className="mt-2">
							The Service is provided for informational and
							educational purposes only. Nothing in the Service
							constitutes financial advice, investment advice,
							trading advice, or any other sort of advice.
						</p>
					</section>

					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							3. Eligibility
						</h2>
						<p>
							You must be at least 18 years of age to use the
							Service. By using the Service, you represent and
							warrant that you are at least 18 years old and have
							the legal capacity to enter into these Terms. If you
							are using the Service on behalf of an organization,
							you represent that you have the authority to bind
							that organization to these Terms.
						</p>
					</section>

					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							4. User Accounts and Wallet Connection
						</h2>
						<p>
							To access certain features of the Service, you may
							need to connect a cryptocurrency wallet. You are
							responsible for maintaining the security of your
							wallet and any associated credentials. You agree to:
						</p>
						<ul className="list-disc list-inside mt-2 space-y-1 ml-4">
							<li>
								Keep your wallet credentials and private keys
								secure and confidential
							</li>
							<li>
								Not share your wallet access with any third
								party
							</li>
							<li>
								Notify us immediately of any unauthorized access
								or security breach
							</li>
							<li>
								Accept responsibility for all activities that
								occur through your connected wallet
							</li>
						</ul>
					</section>

					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							5. Acceptable Use
						</h2>
						<p>You agree not to use the Service to:</p>
						<ul className="list-disc list-inside mt-2 space-y-1 ml-4">
							<li>
								Violate any applicable laws, regulations, or
								third-party rights
							</li>
							<li>
								Engage in market manipulation, fraud, or any
								deceptive practices
							</li>
							<li>
								Interfere with or disrupt the Service or servers
								connected to the Service
							</li>
							<li>
								Attempt to gain unauthorized access to any part
								of the Service
							</li>
							<li>
								Use automated systems or software to extract
								data from the Service (scraping)
							</li>
							<li>
								Transmit any viruses, malware, or other harmful
								code
							</li>
							<li>
								Impersonate any person or entity, or
								misrepresent your affiliation with any person or
								entity
							</li>
						</ul>
					</section>

					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							6. Intellectual Property
						</h2>
						<p>
							The Service, including all content, features,
							functionality, software, text, images, graphics,
							logos, and trademarks, is owned by or licensed to
							Zenit and is protected by copyright, trademark, and
							other intellectual property laws. You may not copy,
							modify, distribute, sell, or lease any part of the
							Service without our prior written consent.
						</p>
					</section>

					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							7. Disclaimer of Warranties
						</h2>
						<p>
							THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND
							&quot;AS AVAILABLE&quot; BASIS WITHOUT WARRANTIES OF
							ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT
							NOT LIMITED TO IMPLIED WARRANTIES OF
							MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
							AND NON-INFRINGEMENT.
						</p>
						<p className="mt-2">
							We do not warrant that: (a) the Service will be
							uninterrupted, timely, secure, or error-free; (b)
							the results obtained from the Service will be
							accurate or reliable; (c) any data, analysis, or
							information provided through the Service is
							accurate, complete, or current; or (d) any defects
							in the Service will be corrected.
						</p>
					</section>

					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							8. Financial Disclaimer
						</h2>
						<p>
							The information provided through the Service is for
							informational purposes only and should not be
							considered as financial, investment, tax, or legal
							advice. Trading cryptocurrencies and digital assets
							involves significant risk. You should consult with a
							qualified financial advisor before making any
							investment decisions. We are not responsible for any
							financial losses incurred as a result of using the
							Service or acting on any information provided
							through the Service.
						</p>
					</section>

					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							9. Limitation of Liability
						</h2>
						<p>
							TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW,
							IN NO EVENT SHALL ZENIT, ITS DIRECTORS, EMPLOYEES,
							PARTNERS, AGENTS, SUPPLIERS, OR AFFILIATES BE LIABLE
							FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
							CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING
							WITHOUT LIMITATION LOSS OF PROFITS, DATA, USE,
							GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF
							OR IN CONNECTION WITH YOUR ACCESS TO OR USE OF (OR
							INABILITY TO ACCESS OR USE) THE SERVICE.
						</p>
					</section>

					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							10. Indemnification
						</h2>
						<p>
							You agree to defend, indemnify, and hold harmless
							Zenit and its officers, directors, employees, and
							agents from and against any claims, liabilities,
							damages, losses, and expenses, including reasonable
							legal fees, arising out of or in any way connected
							with your access to or use of the Service, your
							violation of these Terms, or your violation of any
							rights of another party.
						</p>
					</section>

					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							11. Third-Party Services
						</h2>
						<p>
							The Service may contain links to or integrate with
							third-party services, websites, or applications. We
							are not responsible for the content, privacy
							policies, or practices of any third-party services.
							Your use of third-party services is at your own risk
							and subject to the terms and conditions of those
							third parties.
						</p>
					</section>

					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							12. Modifications to the Service
						</h2>
						<p>
							We reserve the right to modify, suspend, or
							discontinue the Service (or any part thereof) at any
							time, with or without notice. We shall not be liable
							to you or any third party for any modification,
							suspension, or discontinuation of the Service.
						</p>
					</section>

					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							13. Changes to Terms
						</h2>
						<p>
							We may revise these Terms from time to time. The
							most current version will always be posted on this
							page. If a revision is material, we will provide at
							least 30 days&apos; notice prior to any new terms
							taking effect. By continuing to access or use the
							Service after those revisions become effective, you
							agree to be bound by the revised Terms.
						</p>
					</section>

					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							14. Governing Law
						</h2>
						<p>
							These Terms shall be governed by and construed in
							accordance with the laws of Vietnam, without regard
							to its conflict of law provisions. Any disputes
							arising under or in connection with these Terms
							shall be subject to the exclusive jurisdiction of
							the courts located in Ha Noi, Vietnam.
						</p>
					</section>

					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							15. Severability
						</h2>
						<p>
							If any provision of these Terms is held to be
							invalid, illegal, or unenforceable, the remaining
							provisions shall continue in full force and effect.
						</p>
					</section>

					<section>
						<h2 className="text-lg font-semibold text-white mb-3">
							16. Contact Us
						</h2>
						<p>
							If you have any questions about these Terms, please
							contact us at:
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
