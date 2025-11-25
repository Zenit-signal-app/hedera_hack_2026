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
		question: "Question text goes here",
		answer: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse varius enim in eros elementum tristique. Duis cursus, mi quis viverra ornare, eros dolor interdum nulla, ut commodo diam libero vitae erat. Aenean faucibus nibh et justo cursus id rutrum lorem imperdiet. Nunc ut sem vitae risus tristique posuere.",
	},
	{
		id: 2,
		question: "Question text goes here",
		answer: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse varius enim in eros elementum tristique. Duis cursus, mi quis viverra ornare, eros dolor interdum nulla, ut commodo diam libero vitae erat. Aenean faucibus nibh et justo cursus id rutrum lorem imperdiet. Nunc ut sem vitae risus tristique posuere.",
	},
	{
		id: 3,
		question: "Question text goes here",
		answer: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse varius enim in eros elementum tristique. Duis cursus, mi quis viverra ornare, eros dolor interdum nulla, ut commodo diam libero vitae erat. Aenean faucibus nibh et justo cursus id rutrum lorem imperdiet. Nunc ut sem vitae risus tristique posuere.",
	},
	{
		id: 4,
		question: "Question text goes here",
		answer: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse varius enim in eros elementum tristique. Duis cursus, mi quis viverra ornare, eros dolor interdum nulla, ut commodo diam libero vitae erat. Aenean faucibus nibh et justo cursus id rutrum lorem imperdiet. Nunc ut sem vitae risus tristique posuere.",
	},
	{
		id: 5,
		question: "Question text goes here",
		answer: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse varius enim in eros elementum tristique. Duis cursus, mi quis viverra ornare, eros dolor interdum nulla, ut commodo diam libero vitae erat. Aenean faucibus nibh et justo cursus id rutrum lorem imperdiet. Nunc ut sem vitae risus tristique posuere.",
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
					className="bg-zinc-900 w-2xl rounded-lg border border-zinc-800 overflow-hidden transition-all duration-300"
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
