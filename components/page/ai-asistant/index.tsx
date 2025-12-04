// app/ai/page.tsx
"use client";

import React, { useState } from "react";
import { PromptSuggestions } from "./PromptSuggest";
import { ChatInput } from "./ChatInput";
import LoadingAI from "@/components/common/loading/loading_ai";

interface ChatMessage {
	id: number;
	text: string;
	sender: "user" | "ai";
}

export default function AIChatPage() {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	const CHAT_API_ROUTE = "/api/chat-ai";

	const handleSend = async (message: string) => {
		if (isLoading) return;

		const newUserMessage: ChatMessage = {
			id: Date.now(),
			text: message,
			sender: "user",
		};
		setMessages((prev) => [...prev, newUserMessage]);
		setIsLoading(true);

		try {
			const response = await fetch(CHAT_API_ROUTE, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: message, history: messages }),
			});

			if (!response.ok) {
				throw new Error("API call failed");
			}

			const data = await response.json();

			const newAiMessage: ChatMessage = {
				id: Date.now() + 1,
				text: data.response || "Sorry, I couldn't get a response.",
				sender: "ai",
			};
			setMessages((prev) => [...prev, newAiMessage]);
		} catch (error) {
			console.error("Error communicating with AI:", error);
			const errorMsg: ChatMessage = {
				id: Date.now() + 1,
				text: "Error: Could not connect to the service.",
				sender: "ai",
			};
			setMessages((prev) => [...prev, errorMsg]);
		} finally {
			setIsLoading(false);
		}
	};

	// Hàm xử lý khi click vào nút gợi ý
	const handleSelectPrompt = (prompt: string) => {
		handleSend(prompt);
	};

	return (
		<div className="w-full lg:static relative py-6 lg:px-[217px] px-6 h-screen flex flex-col justify-between">
			<div className="flex flex-col items-center flex-1 justify-center">
				{messages.length === 0 ? (
					<PromptSuggestions onSelectPrompt={handleSelectPrompt} />
				) : (
					<div className="w-full space-y-4">
						{messages.map((msg) => (
							<div
								key={msg.id}
								className={`flex ${
									msg.sender === "user"
										? "justify-end"
										: "justify-start"
								}`}
							>
								<div
									className={`p-3 rounded-lg max-w-[75%] ${
										msg.sender === "user"
											? "bg-primary-600 text-white"
											: "bg-white/10 text-white"
									}`}
								>
									{msg.text}
								</div>
							</div>
						))}
						{isLoading && (
							<div className="flex justify-start">
								<div className="p-3 rounded-lg bg-white/10 text-white animate-pulse">
									<LoadingAI />
								</div>
							</div>
						)}
					</div>
				)}
			</div>
			<ChatInput onSend={handleSend} isLoading={isLoading} />
		</div>
	);
}
