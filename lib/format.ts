import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import updateLocale from "dayjs/plugin/updateLocale";

dayjs.extend(relativeTime);
dayjs.extend(updateLocale);

dayjs.updateLocale("en", {
  relativeTime: {
    future: "in %s",
    past: "%s ago",
    s: "1m",   
    m: "1m",  
    mm: "%dm",
    h: "1h",
    hh: "%dh",
    d: "1d",
    dd: "%dd",
    M: "1mo",
    MM: "%dmo",
    y: "1y",
    yy: "%dy",
  },
});

export function formatTime(timeValue: dayjs.ConfigType): string {
  const targetTime = dayjs(timeValue);
  const now = dayjs();
  
  const minutesDifference = Math.abs(now.diff(targetTime, "minute"));

  const thresholdMinutes = 30;

  if (minutesDifference < thresholdMinutes) {
    return targetTime.fromNow();
  } else {
    return targetTime.format("MMM DD, HH:mm:ss A");
  }
}

export function formatNumber(
	num: number | string,
	decimalPlaces: number = 2
): string {
	const numberValue = typeof num === "string" ? parseFloat(num) : num;

	if (
		isNaN(numberValue) ||
		numberValue === null ||
		numberValue === undefined
	) {
		return "0";
	}

	const absValue = Math.abs(numberValue);
	if (absValue < 10000) {
		let fixedDecimals = decimalPlaces;

		if (absValue < 100) {
			fixedDecimals = 4;
		} else {
			fixedDecimals = 2;
		}

		return numberValue.toLocaleString("en-US", {
			minimumFractionDigits: fixedDecimals,
			maximumFractionDigits: fixedDecimals,
		});
	}
	const tiers = [
		{ value: 1e12, symbol: "T" },
		{ value: 1e9, symbol: "B" },
		{ value: 1e6, symbol: "M" },
		{ value: 1e3, symbol: "K" },
	];
	for (const tier of tiers) {
		if (absValue >= tier.value) {
			const scaledValue = numberValue / tier.value;

			return (
				scaledValue.toLocaleString("en-US", {
					maximumFractionDigits: 2,
					minimumFractionDigits: 0,
				}) + tier.symbol
			);
		}
	}

	return numberValue.toFixed(decimalPlaces);
}

export function formatWallet(
	walletAddress: string,
	startChars: number = 6,
	endChars: number = 4
): string {
	if (!walletAddress || walletAddress.length <= startChars + endChars) {
		return "-";
	}

	const start = walletAddress.substring(0, startChars);
	const end = walletAddress.substring(walletAddress.length - endChars);
	return `${start}...${end}`;
}
