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
	const [status, setStatus] = useState<number>(WebSocket.CLOSED);
	const persistedEnabled = useVaultSocketStore((state) => state.enabled);
	const setPersistedEnabled = useVaultSocketStore(
		(state) => state.setEnabled,
	);
	const channelName = "vault_deposit";
	const effectiveEnabled = enabled || persistedEnabled;

	const sendPendingPayload = useCallback(() => {
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		if (!pendingPayloadRef.current) return;

		ws.send(JSON.stringify(pendingPayloadRef.current));
		pendingPayloadRef.current = null;
	}, []);

	useEffect(() => {
		if (enabled) {
			setPersistedEnabled(true);
		}
	}, [enabled, setPersistedEnabled]);

	useEffect(() => {
		if (!effectiveEnabled) {
			if (wsRef.current) {
				wsRef.current.onclose = null;
				wsRef.current.close();
				wsRef.current = null;
			}
			return;
		}

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

					const payload =
						data.channel === channelName && data.data
							? (data.data as VaultSocketPayload)
							: data.action === channelName ||
								  data.channel === channelName
								? (data as VaultSocketPayload)
								: null;

					if (payload) {
						onMessage?.(payload);

						const message =
							(payload.message as string | undefined) ??
							(payload.status as string | undefined) ??
							(payload.result as string | undefined);

						if (
							message &&
							[
								"ok",
								"oke",
								"success",
								"confirmed",
								"completed",
							].includes(message.toLowerCase())
						) {
							setPersistedEnabled(false);
							if (wsRef.current) {
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
				reconnectTimeout = setTimeout(connect, RECONNECT_INTERVAL);
			};

			ws.onerror = (error) => {
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
	}, [sendPendingPayload, onMessage, effectiveEnabled, setPersistedEnabled]);

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
