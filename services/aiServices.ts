import api from "@/axios/axiosInstance";
import { Message } from "ai";
import dayjs from "dayjs";

export const getChatHistory = async (
	walletAddress: string
): Promise<Message[]> => {
	try {
		const res = await api.get("/ai-assistant/chat", {
			params: {
				wallet_address: walletAddress,
			},
		});
		return res.data || [];
	} catch (error) {
		console.error("Failed to fetch chat history:", error);
		return [];
	}
};

export const saveChatHistory = async (
	walletAddress: string,
	messages: Message[]
) => {
	// console.log('[saveChatHistory] messages:', messages);
	// console.log('--------------------------------');
	try {
		const formattedMessages = messages.map((msg) => {
			let finalTools = {};
			if (msg.toolInvocations) {
				if (Array.isArray(msg.toolInvocations)) {
					if (msg.toolInvocations.length === 0) {
						finalTools = {};
					} else {
						finalTools = {};
					}
				} else {
					finalTools = msg.toolInvocations;
				}
			}
			return {
				id: msg.id,
				content: msg.content || "",
				role: msg.role,
				toolInvocations: finalTools,
				createdAt: dayjs(msg.createdAt).toISOString(),
			};
		});

		const bodyRequest = {
			walletAddress,
			messages: formattedMessages,
		};
		const response = await api.post("/ai-assistant/chat", bodyRequest);
		return await response.data;
	} catch (error) {
		console.log(error);
	}
};
