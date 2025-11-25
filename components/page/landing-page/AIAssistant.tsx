"use client";

import Image from "next/image";
import { useState } from "react";
import AIAssistantIcon from "../../../src/components/icon/AIAssistantIcon";
import AccordionChevronIcon from "../../../src/components/icon/AccordionChevronIcon";

const ACCORDION_ITEMS = {
	"ai-ask": {
		id: "ai-ask",
		title: "AI Ask",
		contentTitle: "This is title",
		contentText:
			"Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book.",
	},
	"ai-plan": {
		id: "ai-plan",
		title: "AI Plan",
		contentTitle: "AI Plan Content",
		contentText: "Content for AI Plan section.",
	},
	"ai-agent": {
		id: "ai-agent",
		title: "AI Agent",
		contentTitle: "AI Agent Content",
		contentText: "Content for AI Agent section.",
	},
} as const;

export default function AIAssistant() {
	const [openAccordion, setOpenAccordion] = useState<string>(
		ACCORDION_ITEMS["ai-ask"].id
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
						{/* AI Ask */}
						<div className="accordion-item">
							<button
								className={`accordion-header ${
									openAccordion === "ai-ask" ? "active" : ""
								}`}
								onClick={() => toggleAccordion("ai-ask")}
							>
								<div className="accordion-header-content">
									<div className="accordion-icon">
										<AIAssistantIcon
											width={24}
											height={24}
										/>
									</div>
									<span className="accordion-title">
										AI Ask
									</span>
								</div>
								<AccordionChevronIcon
									className={`accordion-chevron ${
										openAccordion === "ai-ask"
											? "rotate"
											: ""
									}`}
								/>
							</button>
							{openAccordion === "ai-ask" && (
								<div className="accordion-content">
									<h3 className="accordion-content-title">
										This is title
									</h3>
									<p className="accordion-content-text">
										Lorem Ipsum is simply dummy text of the
										printing and typesetting industry. Lorem
										Ipsum has been the industry's standard
										dummy text ever since the 1500s, when an
										unknown printer took a galley of type
										and scrambled it to make a type specimen
										book.
									</p>
								</div>
							)}
						</div>

						{/* AI Plan */}
						<div className="accordion-item">
							<button
								className={`accordion-header ${
									openAccordion === "ai-plan" ? "active" : ""
								}`}
								onClick={() => toggleAccordion("ai-plan")}
							>
								<div className="accordion-header-content">
									<div className="accordion-icon">
										<AIAssistantIcon
											width={24}
											height={24}
										/>
									</div>
									<span className="accordion-title">
										AI Plan
									</span>
								</div>
								<AccordionChevronIcon
									className={`accordion-chevron ${
										openAccordion === "ai-plan"
											? "rotate"
											: ""
									}`}
								/>
							</button>
							{openAccordion === "ai-plan" && (
								<div className="accordion-content">
									<h3 className="accordion-content-title">
										AI Plan Content
									</h3>
									<p className="accordion-content-text">
										Content for AI Plan section.
									</p>
								</div>
							)}
						</div>

						{/* AI Agent */}
						<div className="accordion-item">
							<button
								className={`accordion-header ${
									openAccordion === "ai-agent" ? "active" : ""
								}`}
								onClick={() => toggleAccordion("ai-agent")}
							>
								<div className="accordion-header-content">
									<div className="accordion-icon">
										<AIAssistantIcon
											width={24}
											height={24}
										/>
									</div>
									<span className="accordion-title">
										AI Agent
									</span>
								</div>
								<AccordionChevronIcon
									className={`accordion-chevron ${
										openAccordion === "ai-agent"
											? "rotate"
											: ""
									}`}
								/>
							</button>
							{openAccordion === "ai-agent" && (
								<div className="accordion-content">
									<h3 className="accordion-content-title">
										AI Agent Content
									</h3>
									<p className="accordion-content-text">
										Content for AI Agent section.
									</p>
								</div>
							)}
						</div>
					</div>

					{/* Right: Image */}
					<div className="ai-assistant-image">
						<Image
							src="/images/ai-assistant.png"
							alt="AI Assistant"
							width={600}
							height={600}
							quality={100}
							priority
						/>
					</div>
				</div>
			</div>
		</section>
	);
}
