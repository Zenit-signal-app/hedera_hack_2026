"use client";

import { useState } from "react";

export default function FAQ() {
	return (
		<section id="faq" className="landing-section faq-section">
			{/* Black Background */}
			<div className="faq-background"></div>

			<div className="landing-section-wrapper">
				<div className="landing-section-content">
					<h2 className="landing-section-title text-[40px]">
						Frequently asked questions
					</h2>
					<p className="landing-section-subtitle">
						Frequently asked questions ordered by popularity.
						Remember that if the visitor has not committed to the
						call to action, they may still have questions (doubts)
						that can be answered.
					</p>
					<FAQAccordion />
				</div>
			</div>
		</section>
	);
}

const FAQ_DATA = [
	{
		id: 1,
		question: "How does the AI Assistant help me trade?",
		answer: "The AI acts as your personal analyst. It monitors the Cardano market 24/7 to provide real-time price updates and instant technical analysis (RSI, ADX, MACD trends), helping you validate your trading decisions based on data, not guesswork.",
	},
	{
		id: 2,
		question: "Is there a fee to use SeerBOT?",
		answer: "Currently, accessing the platform, market analysis, and manual trading tools is free. In the future, advanced features like automated 'Trading Pilot' bots or premium Strategy Vaults may carry a service fee or subscription model",
	},
	{
		id: 3,
		question: "Do I need to register an account or KYC?",
		answer: "No. We value your privacy and decentralization. There is no email sign-up or KYC process required. Simply connect a supported Cardano wallet, and you are ready to access the dashboard immediately.",
	},
	{
		id: 4,
		question: "Question text goes here",
		answer: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse varius enim in eros elementum tristique. Duis cursus, mi quis viverra ornare, eros dolor interdum nulla, ut commodo diam libero vitae erat. Aenean faucibus nibh et justo cursus id rutrum lorem imperdiet. Nunc ut sem vitae risus tristique posuere.",
	},
	{
		id: 5,
		question: "What is the Strategy Vault?",
		answer: "The Strategy Vault is a library of trading setups. You can browse strategies shared by the community or proven via backtesting. It allows you to find a trading style that matches your risk tolerance without building a strategy from scratch.",
	},
	{
		id: 6,
		question: "Is SeerBOT safe? Do you hold my funds?",
		answer: "SeerBOT is strictly non-custodial. We never have access to your private keys or funds. All trades are executed via smart contracts directly from your connected wallet (like Lace, Nami, or Eternl), meaning you retain full control of your assets at all times.",
	},
];

function FAQAccordion() {
	const [closedIds, setClosedIds] = useState<number[]>([]);

	const toggleQuestion = (id: number) => {
		setClosedIds((prev) =>
			prev.includes(id)
				? prev.filter((item) => item !== id)
				: [...prev, id]
		);
	};

	return (
		<div className="space-y-4 flex flex-col gap-5">
			{FAQ_DATA.map((faq) => (
				<div
					key={faq.id}
					className="bg-zinc-900 w-[calc(100vw-32px)] md:w-2xl rounded-lg border border-zinc-800 overflow-hidden transition-all duration-300"
				>
					<button
						onClick={() => toggleQuestion(faq.id)}
						style={{ padding: "16px 24px" }}
						className="w-full cursor-pointer flex items-center justify-between p-6 text-left hover:bg-zinc-800 transition-colors"
					>
						<span className="text-white font-medium text-lg">
							{faq.question}
						</span>
						<svg
							className={`w-5 h-5 text-white transition-transform duration-300 shrink-0 ml-4 ${
								closedIds.includes(faq.id) ? "rotate-45" : ""
							}`}
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>

					<div
						className={`grid transition-all duration-300 ease-in-out ${
							closedIds.includes(faq.id)
								? "grid-rows-[0fr] opacity-0"
								: "grid-rows-[1fr] opacity-100"
						}`}
						style={{
							padding: closedIds.includes(faq.id)
								? "0 24px"
								: "16px 24px",
						}}
					>
						<div className="overflow-hidden">
							<div className="px-6 pb-6 text-zinc-400 text-start leading-relaxed">
								{faq.answer}
							</div>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
