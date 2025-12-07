import api from "@/axios/axiosInstance";
import { Message } from "ai";

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
	try {
		const formattedMessages = messages.map((msg) => {
			let finalCreatedAt = new Date().toISOString();
			if (msg.createdAt) {
				finalCreatedAt =
					msg.createdAt instanceof Date
						? msg.createdAt.toISOString()
						: msg.createdAt;
			}
			return {
				id: msg.id,
				content: msg.content || "",
				role: msg.role,
				created_at: finalCreatedAt,
				toolInvocations: msg.toolInvocations || null,
			};
		});
		const response = await api.post("/ai-assistant/chat", {
			walletAddress,
			messages: formattedMessages,
		});
		return await response.data;
	} catch (error) {
		console.log(error)
	}
};
