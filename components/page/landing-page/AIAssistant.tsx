"use client";

import Image from "next/image";
import { useState } from "react";
import AIAssistantIcon from "../../../src/components/icon/AIAssistantIcon";
import AccordionChevronIcon from "../../../src/components/icon/AccordionChevronIcon";

const ACCORDION_ITEMS = {
	aiAsk: {
		id: "ai-ask",
		title: "AI Ask",
		contentTitle: "This is title",
		contentText:
			"Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book.",
	},
	aiPlan: {
		id: "ai-plan",
		title: "AI Plan",
		contentTitle: "AI Plan Content",
		contentText: "Content for AI Plan section.",
	},
	aiAgent: {
		id: "ai-agent",
		title: "AI Agent",
		contentTitle: "AI Agent Content",
		contentText: "Content for AI Agent section.",
	},
} as const;

export default function AIAssistant() {
	const [openAccordion, setOpenAccordion] = useState<string>(
		ACCORDION_ITEMS.aiAsk.id
	);

	const toggleAccordion = (id: string) => {
		setOpenAccordion(openAccordion === id ? "" : id);
	};

	return (
		<section
			id="ai-assistant"
			className="landing-section ai-assistant-section"
		>
			{/* Black Background */}
			<div className="ai-assistant-background"></div>

			{/* Content Wrapper */}
			<div className="landing-section-wrapper">
				{/* Header */}
				<div className="ai-assistant-header">
					<h2 className="landing-section-title">
						Meet Your{" "}
						<span className="text-[#A373FF]">AI Assistant</span>
					</h2>
					<p className="landing-section-subtitle w-full max-w-[unset!important]">
						Lorem Ipsum is simply dummy text of the printing and
						typesetting industry. Lorem Ipsum has been the
						industry's standard dummy text ever since the 1500s,
						when an unknown printer took a galley of type and
						scrambled it to make a type specimen book.
					</p>
				</div>

				{/* Main Content: Accordion + Image */}
				<div className="ai-assistant-content">
					{/* Left: Accordion */}
					<div className="ai-assistant-accordion">
					{Object.values(ACCORDION_ITEMS).map((item) => (
						<div
							key={item.id}
							className="accordion-item"
						>
							<button
								className={`accordion-header ${
									openAccordion === item.id
										? "active"
										: ""
								}`}
								onClick={() => toggleAccordion(item.id)}
							>
									<div className="accordion-header-content">
										<div className="accordion-icon">
											<AIAssistantIcon
												width={24}
												height={24}
											/>
										</div>
										<span className="accordion-title">
											{item.title}
										</span>
									</div>
									<AccordionChevronIcon
										className={`accordion-chevron ${
											openAccordion === item.id
												? "rotate"
												: ""
										}`}
									/>
								</button>
								{openAccordion === item.id && (
									<div className="accordion-content">
										<h3 className="accordion-content-title">
											{item.contentTitle}
										</h3>
										<p className="accordion-content-text">
											{item.contentText}
										</p>
									</div>
								)}
							</div>
						))}
					</div>

				{/* Right: Image */}
				<div className="ai-assistant-image">
					{/* Desktop Image */}
					<Image
						src="/images/ai-assistant.png"
						alt="AI Assistant"
						width={600}
						height={600}
						quality={100}
						priority
						className="ai-assistant-image-desktop"
					/>
					{/* Mobile Image */}
					<Image
						src="/images/ai-assistant-mobile.png"
						alt="AI Assistant"
						width={343}
						height={343}
						quality={100}
						priority
						className="ai-assistant-image-mobile"
					/>
				</div>
				</div>
			</div>
		</section>
	);
}
