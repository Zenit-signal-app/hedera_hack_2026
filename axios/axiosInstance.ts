import axios from "axios";

const api = axios.create({
	baseURL: process.env.NEXT_PUBLIC_BASE_API_URL || "https://zenit-api.seerbot.io/",
	headers: {
		"Content-Type": "application/json",
	},
});

api.interceptors.request.use(
	(config) => {
		return config;
	},
	(error) => {
		return Promise.reject(error);
	}
);

export default api;
