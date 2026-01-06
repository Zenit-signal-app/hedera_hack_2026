/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMarketStore } from "../store/marketStore";
import { parseTokenPair } from '../lib/ultils';


const SOCKET_URL = "wss://api.seerbot.io/ws";

export const useMarketSocket = (
	tokenSymbols: string[] | string,
	type: "ohlc" | "token_info"
) => {
	const { updatePrices } = useMarketStore();
	const wsRef = useRef<WebSocket | null>(null);
	const previousSymbolsRef = useRef<string[]>([]);

	const symbols = Array.isArray(tokenSymbols) ? tokenSymbols : [tokenSymbols];

	// Initialize WebSocket connection once
	useEffect(() => {
		const ws = new WebSocket(SOCKET_URL);
		wsRef.current = ws;

		ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);

				if (data.status === "already_subscribed") {
					return;
				}

				if (data.channel && data.data) {
					const symbol = data.channel.split(":")[1].split("|")[0];
					const update = {
						[symbol]: data.data,
					};
					updatePrices(update, type);
				}
			} catch (e) {
				console.error("Error parsing socket message:", e);
			}
		};

		ws.onclose = () => {
			console.log("Socket Disconnected.");
		};

		ws.onerror = (error) => {
			console.error("Socket Error:", error);
		};

		return () => {
			ws.close();
			wsRef.current = null;
		};
	}, [updatePrices]);

	// Handle subscription/unsubscription when symbols change
	useEffect(() => {
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) return;

		const previousSymbols = previousSymbolsRef.current;

		// Unsubscribe from old symbols
		previousSymbols.forEach((symbol) => {
			const { baseToken } = parseTokenPair(symbol);
			const channelName =
				type === "ohlc"
					? `${type}:${symbol}|5m`
					: `${type}:${baseToken}`;

			const unsubscribeMessage = JSON.stringify({
				action: "unsubscribe",
				channel: channelName,
			});

			ws.send(unsubscribeMessage);
		});

		// Subscribe to new symbols
		symbols.forEach((symbol) => {
			const { baseToken } = parseTokenPair(symbol);
			const channelName =
				type === "ohlc"
					? `${type}:${symbol}|5m`
					: `${type}:${baseToken}`;

			const subscribeMessage = JSON.stringify({
				action: "subscribe",
				channel: channelName,
			});

			ws.send(subscribeMessage);
		});

		// Update reference
		previousSymbolsRef.current = symbols;
	}, [symbols, type]);

	const [status, setStatus] = useState<number | null>(null);

	useEffect(() => {
		const current = wsRef.current;
		if (!current) {
			setStatus(null);
			return;
		}

		setStatus(current.readyState);

		const handleOpen = () => setStatus(WebSocket.OPEN);
		const handleClose = () => setStatus(WebSocket.CLOSED);
		const handleError = () => setStatus(current.readyState);

		current.addEventListener("open", handleOpen);
		current.addEventListener("close", handleClose);
		current.addEventListener("error", handleError);

		return () => {
			current.removeEventListener("open", handleOpen);
			current.removeEventListener("close", handleClose);
			current.removeEventListener("error", handleError);
		};
	}, [symbols.join(",")]);

	const sendMessage = useCallback((message: any) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(message));
		}
	}, []);

	return {
		sendMessage,
		status,
	};
};
