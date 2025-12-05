import api from "@/axios/axiosInstance";
import { Message } from "ai";

export const getChatHistory = async (
	wallet_address: string
): Promise<Message[]> => {
	try {
		const res = await api.get("/ai-assistant/chat", {
			params: {
				wallet_address,
			},
		});
		return res.data?.messages || [];
	} catch (error) {
		console.error("Failed to fetch chat history:", error);
		return [];
	}
};

export const saveChatHistory = async (
	wallet_address: string,
	messages: Message[]
) => {
	try {
		await api.post("/ai-assistant/chat", {
			wallet_address,
			messages,
		});

	} catch (error) {
		console.error("Failed to save chat history:", error);
	}
};
