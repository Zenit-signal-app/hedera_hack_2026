import { openai } from "@ai-sdk/openai";
import {
	appendResponseMessages,
	createDataStreamResponse,
	createIdGenerator,
	smoothStream,
	streamText,
} from "ai";
import type { Message } from "ai";
import { DEFI_ASSISTANT_PROMPT } from "@/lib/system-prompts";
import { getChatHistory, saveChatHistory } from "@/services/aiServices";

const MAX_CONTEXT_MESSAGES = 8;

export async function POST(req: Request) {
	const { messages, walletAddress } = await req.json();
	const abortController = new AbortController();
	const signal = abortController.signal;
	try {
		const contextMessages: Message[] = messages
			.slice(-MAX_CONTEXT_MESSAGES)
			.map((message: Message) => {
				if (message?.toolInvocations !== undefined && message.toolInvocations.length > 0) {
					return {
						...message,
						toolInvocations: message.toolInvocations.map(
							(invocation) => ({
								...invocation,
								result: "success",
							})
						),
					};
				}
				return message;
			});
		console.log("walletAddress", walletAddress);

		const latestMessage = messages[messages.length - 1];
		if (latestMessage.role === "user") {
			try {
				await saveChatHistory(walletAddress, [latestMessage]);
			} catch (error) {}
		}
		return createDataStreamResponse({
			execute: async (dataStream) => {
				try {
					const latestMessage = messages[messages.length - 1];
					if (latestMessage.role === "user") {
						await saveChatHistory(walletAddress, [latestMessage]);
					}

					const result = streamText({
						model: openai("gpt-4o-mini"),
						experimental_transform: smoothStream(),
						messages: contextMessages,
						maxSteps: 5,
						abortSignal: signal,
						system: DEFI_ASSISTANT_PROMPT,
						experimental_generateMessageId: createIdGenerator({
							prefix: "assistant",
							size: 32,
						}),
						onStepFinish: async (event) => {
							if (event.toolResults?.length) {
								for (const result of event.toolResults) {
									if (result) {
										try {
											const existingMessages =
												await getChatHistory(
													walletAddress
												);
											const updatedMessages =
												appendResponseMessages({
													messages: existingMessages,
													responseMessages:
														event.response.messages,
												});

											await saveChatHistory(
												walletAddress,
												updatedMessages
											);

											// Abort after saving
											abortController.abort();
										} catch (error) {
											console.error(
												"Error saving messages before abort:",
												error
											);
										}
										break;
									}
								}
							}
						},
						onFinish: async (event) => {
							if (!walletAddress) return;
							try {
								const updatedMessages = appendResponseMessages({
									messages: [],
									responseMessages: event.response.messages,
								});
								await saveChatHistory(
									walletAddress,
									updatedMessages
								);
								dataStream.writeMessageAnnotation({
									saved: true,
								});
							} catch (error) {
								dataStream.writeMessageAnnotation({
									saved: false,
									error: String(error),
								});
								throw error;
							}
						},
						onError: (error) => {},
					});
					result.mergeIntoDataStream(dataStream);
				} catch (error) {
					throw error;
				}
			},
		});
	} catch (error) {
		console.error("Fatal error in chat API:", error);
		return new Response(
			JSON.stringify({
				error: "Internal server error",
				details: error instanceof Error ? error.message : String(error),
			}),
			{ status: 500, headers: { "Content-Type": "application/json" } }
		);
	}
}
