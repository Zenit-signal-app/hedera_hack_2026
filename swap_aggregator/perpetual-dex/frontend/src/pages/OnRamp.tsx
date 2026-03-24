import { useMemo, useState } from "react";

/**
 * Onramper fiat → crypto on-ramp (iframe).
 *
 * The legacy open-source package https://github.com/onramper/widget is **deprecated**;
 * Onramper recommends the hosted widget + official docs:
 * - https://docs.onramper.com/docs/integration-steps
 *
 * Set `VITE_ONRAMPER_API_KEY` in `frontend/.env` (from your Onramper dashboard).
 */
const ONRAMP_BASE = "https://buy.onramper.com";

export default function OnRamp() {
  const apiKey = (import.meta.env.VITE_ONRAMPER_API_KEY ?? "").trim();
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const iframeSrc = useMemo(() => {
    if (!apiKey) return "";
    const u = new URL(ONRAMP_BASE);
    u.searchParams.set("apiKey", apiKey);
    u.searchParams.set("mode", "buy");
    return u.toString();
  }, [apiKey]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-2xl border border-[#363a59] bg-[#121421]/80 p-6 shadow-inner shadow-black/20">
        <h1 className="text-xl font-bold text-white sm:text-2xl">Buy crypto (Onramper)</h1>
        <p className="mt-2 text-sm text-slate-400">
          Mua crypto bằng thẻ/chuyển khoản qua Onramper. Sau khi có HBAR / token hỗ trợ, bạn có thể chuyển về ví HashPack và dùng trên Zenit Perpetual DEX (Hedera Testnet).
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Gói <code className="rounded bg-slate-800 px-1 py-0.5">@onramper/widget</code> trên GitHub đã{" "}
          <strong>deprecated</strong> — dùng widget hosted + API key theo{" "}
          <a
            href="https://docs.onramper.com/docs/integration-steps"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 underline hover:text-indigo-300"
          >
            tài liệu Onramper
          </a>
          .
        </p>
      </div>

      {!apiKey ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-6 text-sm text-amber-100">
          <p className="font-semibold">Chưa cấu hình API key</p>
          <p className="mt-2 text-amber-200/90">
            Thêm vào <code className="rounded bg-black/30 px-1">perpetual-dex/frontend/.env</code>:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-slate-200">
            VITE_ONRAMPER_API_KEY=your_onramper_api_key
          </pre>
          <p className="mt-3 text-xs text-amber-200/80">
            Lấy key từ dashboard Onramper; sau đó khởi động lại <code className="rounded bg-black/30 px-1">npm run dev</code>.
          </p>
        </div>
      ) : (
        <div className="relative rounded-2xl border border-[#363a59] bg-[#0d0f18] p-4">
          {!iframeLoaded && (
            <div className="absolute inset-4 z-10 flex min-h-[320px] items-center justify-center rounded-lg bg-[#0d0f18]/95 text-sm text-slate-400">
              Đang tải widget Onramper…
            </div>
          )}
          <iframe
            title="Onramper — Buy crypto"
            src={iframeSrc}
            className="mx-auto block h-[630px] w-full max-w-[420px] rounded-lg border border-[#58585f] bg-[#121421]"
            allow="accelerometer; autoplay; camera; gyroscope; payment; microphone"
            onLoad={() => setIframeLoaded(true)}
          />
        </div>
      )}
    </div>
  );
}
