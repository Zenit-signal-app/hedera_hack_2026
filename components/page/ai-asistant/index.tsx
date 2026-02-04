/* eslint-disable @typescript-eslint/no-explicit-any */
// app/ai/page.tsx
"use client";

import { PromptSuggestions } from "./PromptSuggest";
import ChatInput from "./ChatInput";
import LoadingAI from "@/components/common/loading/loading_ai";
import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getChatHistory } from "@/services/aiServices";
import { useWalletStore } from "@/store/walletStore";
import { createIdGenerator } from "ai";

export default function AIChatPage() {
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const scrollToBottom = useCallback(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	const walletAddress = useWalletStore((state) => state.usedAddress);
	const {
		messages,
		setMessages,
		input,
		handleInputChange,
		handleSubmit,
		isLoading: loadingAI,
	} = useChat({
		api: "/api/chat",
		sendExtraMessageFields: true,
		generateId: createIdGenerator({
			prefix: "user",
			size: 32,
		}),
		body: {
			walletAddress,
		},
	});

	useEffect(() => {
		const loadHistory = async () => {
			if (walletAddress) {
				const rawHistory = await getChatHistory(walletAddress);
				if (rawHistory && rawHistory.length > 0) {
					const formattedHistory = rawHistory.map((msg: any) => ({
						id: msg.id,
						role: msg.role,
						content: msg.content,
						createdAt: msg.created_at
							? new Date(msg.created_at)
							: new Date(),

						toolInvocations: msg.tool_invocations || undefined,
					}));
					setMessages(formattedHistory);
				}
			}
		};

		loadHistory();
	}, [walletAddress, setMessages]);

	const handleSelectPrompt = (e: string) => {
		handleInputChange({
			target: { value: e },
		} as React.ChangeEvent<HTMLTextAreaElement>);
	};
	useEffect(() => {
		const timer = setTimeout(scrollToBottom, 100);
		return () => clearTimeout(timer);
	}, [messages.length, scrollToBottom]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (e.nativeEvent.isComposing) return;
			handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
		}
	};

	return (
		<div className="w-full h-screen flex flex-col lg:px-[217px] px-6 py-6 gap-y-4">
			<div className="flex-1 lg:pt-20 space-y-4 pb-6 overflow-y-auto scrollbar-hide">
				{messages.length === 0 ? (
					<div className="h-full flex items-center justify-center">
						<PromptSuggestions
							onSelectPrompt={handleSelectPrompt}
						/>
					</div>
				) : (
					<>
						{messages.map((msg) => {
							return msg.role === "user" ? (
								<div key={msg.id}>
									<div className="flex justify-end text-sm">
										<p className="px-4 py-2.5 bg-white/10 rounded-xl text-right font-quicksand w-max max-w-3/5 break-all">
											{msg.content}
										</p>
									</div>
								</div>
							) : (
								<div
									className="font-montserrat text-sm w-11/12 sm:w-5/6 md:w-4/5 lg:w-3/4 xl:w-2/3"
									key={msg.id}
								>
									<ReactMarkdown
										remarkPlugins={[remarkGfm]}
										components={{
											p: ({ ...props }) => (
												<p
													className="mb-2 last:mb-0 whitespace-pre-line"
													{...props}
												/>
											),
											a: ({ ...props }) => (
												<a
													className="text-[#7f00ff] hover:underline cursor-pointer"
													{...props}
												/>
											),
											ul: ({ ...props }) => (
												<ul
													className="list-disc list-inside mb-2"
													{...props}
												/>
											),
											ol: ({ ...props }) => (
												<ol
													className="list-decimal list-inside mb-2"
													{...props}
												/>
											),
											li: ({ ...props }) => (
												<li
													className="mb-1 [&>p]:inline [&>p]:m-0"
													{...props}
												/>
											),
											code: ({
												inline,
												...props
											}: {
												inline?: boolean;
											} & React.HTMLProps<HTMLElement>) =>
												inline ? (
													<code
														className="bg-black/30 rounded px-1 py-0.5"
														{...props}
													/>
												) : (
													<code
														className="block bg-black/30 rounded p-2 my-2 overflow-x-auto"
														{...props}
													/>
												),
											pre: ({ ...props }) => (
												<pre
													className="bg-black/30 rounded p-2 my-2 overflow-x-auto"
													{...props}
												/>
											),
											h1: ({ ...props }) => (
												<h1
													className="text-lg font-bold mb-2"
													{...props}
												/>
											),
											h2: ({ ...props }) => (
												<h2
													className="text-base font-bold mb-2"
													{...props}
												/>
											),
											h3: ({ ...props }) => (
												<h3
													className="text-sm font-bold mb-2"
													{...props}
												/>
											),
											blockquote: ({ ...props }) => (
												<blockquote
													className="border-l-2 border-[#7f00ff] pl-4 my-2 italic"
													{...props}
												/>
											),
											table: ({ ...props }) => (
												<div className="overflow-x-auto my-2">
													<table
														className="min-w-full divide-y divide-[#27272A]"
														{...props}
													/>
												</div>
											),
											th: ({ ...props }) => (
												<th
													className="px-3 py-2 text-left text-sm font-semibold"
													{...props}
												/>
											),
											td: ({ ...props }) => (
												<td
													className="px-3 py-2 text-sm"
													{...props}
												/>
											),
											div: ({
												className,
												...props
											}: React.HTMLProps<HTMLDivElement>) => {
												if (
													className?.includes(
														"Position Summary"
													) ||
													className?.includes(
														"Account Status"
													)
												) {
													return (
														<div
															className="bg-black/20 rounded-lg p-3 my-2 space-y-1"
															{...props}
														/>
													);
												}
												return <div {...props} />;
											},
											strong: ({
												children,
												...props
											}: React.HTMLProps<HTMLElement>) => {
												const text = String(children);
												if (
													text.startsWith(
														"Successfully"
													)
												) {
													return (
														<strong
															className="text-green-400 font-medium"
															{...props}
														>
															{children}
														</strong>
													);
												}
												return (
													<strong
														className="font-medium"
														{...props}
													>
														{children}
													</strong>
												);
											},
										}}
									>
										{msg.content}
									</ReactMarkdown>
								</div>
							);
						})}
						{loadingAI && (
							<div className="flex justify-start">
								<LoadingAI />
							</div>
						)}
						<div ref={messagesEndRef} />
					</>
				)}
			</div>
			<div className="flex-shrink-0 border-t border-white/10 pt-3">
				<ChatInput
					value={input}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					ref={inputRef}
					disabled={loadingAI}
					handleSubmit={handleSubmit}
				/>
			</div>
		</div>
	);
}
