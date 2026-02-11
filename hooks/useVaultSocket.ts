"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVaultSocketStore } from "@/store/vaultSocketStore";
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
	const pendingPayloadRef = useRef<VaultSocketPayload | null>(null);
	const shouldReconnectRef = useRef(false);
	const manualCloseRef = useRef(false);
	const [status, setStatus] = useState<number>(WebSocket.CLOSED);
	const clearTxId = useVaultSocketStore((state) => state.clearTxId);
	const channelName = "vault_deposit";
	const effectiveEnabled = enabled;

	const sendPendingPayload = useCallback(() => {
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		if (!pendingPayloadRef.current) return;

		ws.send(JSON.stringify(pendingPayloadRef.current));
		pendingPayloadRef.current = null;
	}, []);

	useEffect(() => {
		if (!effectiveEnabled) {
			shouldReconnectRef.current = false;
			manualCloseRef.current = true;
			if (wsRef.current) {
				wsRef.current.onclose = null;
				wsRef.current.close();
				wsRef.current = null;
			}
			return;
		}

		shouldReconnectRef.current = true;
		manualCloseRef.current = false;

		let reconnectTimeout: NodeJS.Timeout;

		const connect = () => {
			const ws = new WebSocket(SOCKET_URL);
			wsRef.current = ws;
			setStatus(WebSocket.CONNECTING);

			ws.onopen = () => {
				setStatus(WebSocket.OPEN);
				sendPendingPayload();
			};

			ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);

					if (data.status === "already_subscribed") return;

					const payload = data;

					if (payload) {
						onMessage?.(payload);

						const message = payload.message as string;

						if (
							message &&
							[
								"ok",
								"oke",
								"success",
								"confirmed",
								"completed",
								"already_completed",
							].includes(message.toLowerCase())
						) {
							console.log("Clear");

							clearTxId();
							if (wsRef.current) {
								manualCloseRef.current = true;
								wsRef.current.onclose = null;
								wsRef.current.close();
								wsRef.current = null;
							}
							setStatus(WebSocket.CLOSED);
						}
					}
				} catch (error) {
					console.error("Vault socket parse error:", error);
				}
			};

			ws.onclose = () => {
				setStatus(WebSocket.CLOSED);
				if (!shouldReconnectRef.current || manualCloseRef.current)
					return;
				reconnectTimeout = setTimeout(connect, RECONNECT_INTERVAL);
			};

			ws.onerror = (error) => {
				ws.close();
			};
		};

		connect();

		return () => {
			shouldReconnectRef.current = false;
			manualCloseRef.current = true;
			if (wsRef.current) {
				wsRef.current.onclose = null;
				wsRef.current.close();
			}
			clearTimeout(reconnectTimeout);
		};
	}, [sendPendingPayload, onMessage, effectiveEnabled]);

	useEffect(() => {
		if (status === WebSocket.OPEN) {
			sendPendingPayload();
		}
	}, [status, sendPendingPayload]);

	const sendMessage = useCallback(
		(payload: VaultSocketPayload) => {
			if (!effectiveEnabled) return;
			pendingPayloadRef.current = payload;
			if (wsRef.current?.readyState === WebSocket.OPEN) {
				wsRef.current.send(JSON.stringify(payload));
				pendingPayloadRef.current = null;
			}
		},
		[effectiveEnabled],
	);

	return {
		sendMessage,
		status,
	};
};
