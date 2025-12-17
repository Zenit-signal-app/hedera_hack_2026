import { openai } from "@ai-sdk/openai";
import {
	appendResponseMessages,
	createDataStreamResponse,
	createIdGenerator,
	smoothStream,
	streamText,
} from "ai";
import type { Message } from "ai";
import { SYSTEM_PROMPT } from "@/lib/system-prompts";
import { saveChatHistory } from "@/services/aiServices";
import { marketAnalysisTool, getSupportedTokensTool, adaAnalysisTool } from "@/ai-tools/market-analysis";

const MAX_CONTEXT_MESSAGES = 8;

const TOOLS = {
	marketAnalysis: marketAnalysisTool,
	getSupportedTokens: getSupportedTokensTool,
	adaAnalysis: adaAnalysisTool,
};

export async function POST(req: Request) {
	const { messages, walletAddress } = await req.json();
	const abortController = new AbortController();
	const signal = abortController.signal;
	try {
		const contextMessages: Message[] = messages
			.slice(-MAX_CONTEXT_MESSAGES)
			.map((message: Message) => {
				if (
					message?.toolInvocations !== undefined &&
					message.toolInvocations.length > 0
				) {
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

		// deprecated: saveChatHistory is called in createDataStreamResponse
		// const latestMessage = messages[messages.length - 1];
		// if (latestMessage.role === "user") {
		// 	try {
		// 		await saveChatHistory(walletAddress, [latestMessage]);
		// 	} catch (error) {}
		// }
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
						tools: TOOLS,
						system: SYSTEM_PROMPT,
						experimental_generateMessageId: createIdGenerator({
							prefix: "assistant",
							size: 32,
						}),
						onStepFinish: async (event) => {
							// Check if any tool result has shouldAbort flag
							if (event.toolResults?.length) {
								for (const result of event.toolResults) {
									if (result && 'shouldAbort' in result.result && result.result.shouldAbort === true) {
										try {
											const responseMessages = appendResponseMessages({
												messages: [latestMessage],
												responseMessages: event.response.messages,
											});
											await saveChatHistory(
												walletAddress,
												responseMessages
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
									messages: [latestMessage],
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
								console.error('Error in onFinish:', error);
								dataStream.writeMessageAnnotation({
									saved: false,
									error: String(error),
								});
								// Don't re-throw - let the stream complete
							}
						},
						onError: (error) => {
							console.log('----- onError -----');
							console.log('error:', error);
							console.log('--------------------------------');
						},
					});
					result.mergeIntoDataStream(dataStream);
				} catch (error) {
					throw error;
				}
			},
		});
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: "Internal server error",
				details: error instanceof Error ? error.message : String(error),
			}),
			{ status: 500, headers: { "Content-Type": "application/json" } }
		);
	}
}
