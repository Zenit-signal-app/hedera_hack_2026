import React from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsTrigger } from "@/components/ui/tabs";
import { TabsList } from "@radix-ui/react-tabs";

export type TabItem = {
	value: string;
	label: string | React.ReactNode;
};

type TabVariant = "pill" | "underline";

interface TabsWrapperProps {
	tabs: TabItem[];
	variant: TabVariant;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	className?: string;
	value?: string;
}

const TabsWrapper: React.FC<TabsWrapperProps> = ({
	tabs,
	variant,
	defaultValue,
	onValueChange,
	className,
	value,
}) => {
	const tabsListBaseClasses = "flex items-center space-x-1 p-1 ";
	let tabsListVariantClasses = "";
	let triggerBaseClasses =
		"px-4 py-2 text-sm font-semibold transition-all duration-200 cursor-pointer";
	let triggerActiveClasses = "";
	let triggerInactiveClasses = "";

	if (variant === "pill") {
		tabsListVariantClasses =
			"p-1 bg-primary-900 rounded-md shadow-inner w-max";
		triggerBaseClasses = "px-3 py-1.5 rounded-md relative z-10";
		triggerInactiveClasses = "text-gray-400 hover:text-gray-200";
		triggerActiveClasses =
			"data-[state=active]:bg-white data-[state=active]:text-primary-500 data-[state=active]:shadow-md";
	} else if (variant === "underline") {
		tabsListVariantClasses = "w-full";
		triggerBaseClasses = "px-4 py-3 relative";
		triggerInactiveClasses = "text-gray-500 hover:text-white";
		triggerActiveClasses =
			'data-[state=active]:text-white data-[state=active]:after:content-[""] data-[state=active]:after:absolute data-[state=active]:after:bottom-[-4px] data-[state=active]:after:left-0 data-[state=active]:after:w-full data-[state=active]:after:h-px data-[state=active]:after:bg-primary-500';
	}

	return (
		<Tabs
			defaultValue={defaultValue}
			onValueChange={onValueChange}
			className={cn("w-full", className)}
			{...(value !== undefined && { value })}
		>
			<TabsList
				className={cn(tabsListBaseClasses, tabsListVariantClasses)}
			>
				{tabs.map((tab) => (
					<TabsTrigger
						key={tab.value}
						value={tab.value}
						className={cn(
							triggerBaseClasses,
							triggerInactiveClasses,
							triggerActiveClasses
						)}
					>
						{tab.label}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
};

export default TabsWrapper;
