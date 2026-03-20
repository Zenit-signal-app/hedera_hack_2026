import "@/lib/appkitFetchOverrides";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "./config/wagmi";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

function Root() {
  return (
    <React.StrictMode>
      <ErrorBoundary
        fallback={
          <div className="min-h-screen bg-[#0d0f18] flex flex-col items-center justify-center gap-4 p-8 text-white">
            <h1 className="text-xl font-semibold text-red-400">Lỗi khởi động ứng dụng</h1>
            <p className="text-slate-400 text-center max-w-md">
              Mở DevTools (F12) → Console để xem chi tiết lỗi.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 font-medium"
            >
              Tải lại trang
            </button>
          </div>
        }
      >
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        </WagmiProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
