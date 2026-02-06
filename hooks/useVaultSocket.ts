"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SOCKET_URL = "wss://api.seerbot.io/ws";
const RECONNECT_INTERVAL = 3000;

type VaultSocketPayload = Record<string, unknown>;

type UseVaultSocketOptions = {
	onMessage?: (payload: VaultSocketPayload) => void;
	enabled?: boolean;
};

export const useVaultSocket = ({
	onMessage,
	enabled = true,
}: UseVaultSocketOptions = {}) => {
	const wsRef = useRef<WebSocket | null>(null);
	const queueRef = useRef<string[]>([]);
	const statusRef = useRef<number>(WebSocket.CLOSED);
	const [status, setStatus] = useState<number>(WebSocket.CLOSED);

	const flushQueue = useCallback(() => {
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) return;

		while (queueRef.current.length > 0) {
			const message = queueRef.current.shift();
			if (message) {
				ws.send(message);
			}
		}
	}, []);

	useEffect(() => {
		if (!enabled) {
			if (wsRef.current) {
				wsRef.current.onclose = null;
				wsRef.current.close();
				wsRef.current = null;
			}
			statusRef.current = WebSocket.CLOSED;
			return;
		}

		let reconnectTimeout: NodeJS.Timeout;

		const connect = () => {
			const ws = new WebSocket(SOCKET_URL);
			wsRef.current = ws;
			statusRef.current = WebSocket.CONNECTING;

			ws.onopen = () => {
				statusRef.current = WebSocket.OPEN;
				setStatus(WebSocket.OPEN);
				flushQueue();
			};

			ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data) as VaultSocketPayload;
					onMessage?.(data);
				} catch (error) {
					console.error("Vault socket parse error:", error);
				}
			};

			ws.onclose = () => {
				statusRef.current = WebSocket.CLOSED;
				setStatus(WebSocket.CLOSED);
				reconnectTimeout = setTimeout(connect, RECONNECT_INTERVAL);
			};

			ws.onerror = (error) => {
				console.error("Vault socket error:", error);
				ws.close();
			};
		};

		connect();

		return () => {
			if (wsRef.current) {
				wsRef.current.onclose = null;
				wsRef.current.close();
			}
			clearTimeout(reconnectTimeout);
		};
	}, [flushQueue, onMessage, enabled]);

	const sendMessage = useCallback((payload: VaultSocketPayload) => {
		if (!enabled) return;
		const message = JSON.stringify(payload);
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(message);
			return;
		}

		queueRef.current.push(message);
	}, [enabled]);

	return {
		sendMessage,
		status,
	};
};
