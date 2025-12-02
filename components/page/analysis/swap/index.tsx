"use client";

import SettingIcon from "@/components/icon/Icon_Setting";
import { useTranslations } from "next-intl";
import { SwapInterface } from "./TokenInputCard";
import { useTokenStore } from "@/store/tokenStore";
import { parseTokenPair } from "@/lib/ultils";

const SwapContainer = () => {
	const t = useTranslations("analysis");
	
	return (
		<div className="border border-dark-gray-700 rounded-4xl p-3 flex flex-col gap-y-3">
			<div className="text-white flex items-center justify-between">
				{t("swap")} <SettingIcon />
			</div>
			<SwapInterface />
		</div>
	);
};

export default SwapContainer;
