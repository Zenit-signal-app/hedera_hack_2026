// components/PromptSuggestions.tsx
import React from "react";
import { Search, Zap, LayoutDashboard } from "lucide-react";
import PortfolioIcon from "@/components/icon/Icon_ Portfolio";
import AnalysisIcon from "@/components/icon/Icon_ Analysis";
import VaultIcon from "@/components/icon/Icon_ Vault";

interface SuggestionProps {
	label: string;
	icon: React.ReactNode;
	onClick: () => void;
}

const SuggestionButton: React.FC<SuggestionProps> = ({
	label,
	icon,
	onClick,
}) => (
	<button
		onClick={onClick}
		className="w-full mx-auto flex items-center max-w-[564px] p-3 my-2 
               bg-white/5 backdrop-blur-md rounded-full border border-white/10 
               hover:bg-white/10 transition-colors shadow-lg"
	>
		<span className="mr-4 text-white">{icon}</span>
		<span className="text-white font-medium text-sm">{label}</span>
	</button>
);

interface PromptSuggestionsProps {
	onSelectPrompt: (prompt: string) => void;
}

export const PromptSuggestions: React.FC<PromptSuggestionsProps> = ({
	onSelectPrompt,
}) => {
	const prompts = [
		{
			label: "Summarize my portfolio performance",
			icon: <PortfolioIcon className="w-6 h-6" />,
			value: "Summarize my portfolio performance",
		},
		{
			label: "Analyze market signal for SNEK",
			icon: <AnalysisIcon className="w-6 h-6" />,
			value: "Analyze market signal for SNEK",
		},
		{
			label: "Recommend stable Vault with ROI > 5%",
			icon: <VaultIcon className="w-6 h-6" />,
			value: "Recommend stable Vault with ROI > 5%",
		},
	];

	return (
		<div className="flex flex-col items-center mt-16 w-full">
			<h2 className="text-4xl font-bold mb-10 text-white">
				How can I help today?
			</h2>
			{prompts.map((p, index) => (
				<SuggestionButton
					key={index}
					label={p.label}
					icon={p.icon}
					onClick={() => onSelectPrompt(p.value)}
				/>
			))}
		</div>
	);
};
