"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMarketStore } from "../store/marketStore";
import { parseTokenPair } from "@/lib/ultils";

const SOCKET_URL = "wss://api.seerbot.io/ws";
const RECONNECT_INTERVAL = 3000; 

export const useMarketSocket = (
  tokenSymbols: string[] | string,
  type: "ohlc" | "token_info"
) => {
  const { updatePrices } = useMarketStore();
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<number>(WebSocket.CLOSED);
  
  const symbols = Array.isArray(tokenSymbols) ? tokenSymbols : [tokenSymbols];
  const symbolsKey = symbols.join(",");
  const subscribeToSymbols = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    symbols.forEach((symbol) => {
      const tokenPair = parseTokenPair(symbol); 
      const baseToken = tokenPair?.baseToken;

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
  }, [symbolsKey, type]); 

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      const ws = new WebSocket(SOCKET_URL);
      wsRef.current = ws;
      setStatus(WebSocket.CONNECTING);

      ws.onopen = () => {
        console.log("Socket Connected.");
        setStatus(WebSocket.OPEN);
        // Khi kết nối thành công, gọi subscribe ngay lập tức
        subscribeToSymbols();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.status === "already_subscribed") return;

          if (data.channel && data.data) {
            const parts = data.channel.split(":");
            if (parts.length > 1) {
                const symbolPart = parts[1].split("|")[0];
                const update = { [symbolPart]: data.data };
                updatePrices(update, type);
            }
          }
        } catch (e) {
          console.error("Socket parse error:", e);
        }
      };

      ws.onclose = () => {
        console.log("Socket Disconnected. Reconnecting...");
        setStatus(WebSocket.CLOSED);
        reconnectTimeout = setTimeout(connect, RECONNECT_INTERVAL);
      };

      ws.onerror = (error) => {
        console.error("Socket Error:", error);
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
 
  }, []); 

  useEffect(() => {

    if (status === WebSocket.OPEN) {
      subscribeToSymbols();
    }
  }, [subscribeToSymbols, status]); 

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