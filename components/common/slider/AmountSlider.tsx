"use client";

import { Slider } from "@/components/ui/slider";

interface AmountSliderProps {
	label: string;
	min: number;
	max: number;
	value: number;
	step?: number;
	disabled?: boolean;
	onChange: (value: number) => void;
	unit?: string;
}

const formatAmount = (value: number) => {
	if (!Number.isFinite(value)) return "0";
	const fixed = value.toFixed(6);
	return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
};

const AmountSlider = ({
	label,
	min,
	max,
	value,
	step = 0.01,
	disabled,
	onChange,
	unit = "DOT",
}: AmountSliderProps) => {
	const safeMin = Number.isFinite(min) ? Math.max(min, 0) : 0;
	const safeMax = Number.isFinite(max) ? Math.max(max, 0) : 0;
	const clampedValue = Math.min(Math.max(value, safeMin), safeMax);
	const isDisabled = disabled || safeMax <= 0 || safeMax < safeMin;

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between text-sm text-dark-gray-200">
				<span>{label}</span>
				<span className="text-white font-semibold">
					{formatAmount(clampedValue)} {unit}
				</span>
			</div>
			<Slider
				value={[clampedValue]}
				min={safeMin}
				max={safeMax}
				step={step}
				disabled={isDisabled}
				onValueChange={(values) => {
					const nextValue = values[0];
					if (typeof nextValue === "number") {
						onChange(nextValue);
					}
				}}
			/>
			<div className="flex items-center justify-between text-xs text-dark-gray-400">
				<span>
					Min: {formatAmount(safeMin)} {unit}
				</span>
				<span>
					Max: {formatAmount(safeMax)} {unit}
				</span>
			</div>
		</div>
	);
};

export default AmountSlider;
