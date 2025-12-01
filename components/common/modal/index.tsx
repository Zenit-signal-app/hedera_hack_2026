import React from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog"; 
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Close1Icon from "@/components/icon/Icon_ Close_1";
import ChevronLeftMiniIcon from "@/components/icon/ChevronLeftMiniICon";
interface CommonModalProps {
	title: string;
	children: React.ReactNode;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	trigger?: React.ReactNode;
	className?: string;
	showBack?: boolean;
	handleBack?: (x: string) => void;
}

const CommonModal: React.FC<CommonModalProps> = ({
	title,
	children,
	isOpen,
	onOpenChange,
	trigger,
	className,
	showBack = false,
	handleBack = (x: string) => {},
}) => {
	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			{trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

			<DialogContent className={`sm:max-w-[420px] ${className || ""}`}>
				<DialogHeader className="flex items-center flex-row justify-between">
					<DialogTitle>
						{showBack ? (
							<button
								onClick={() => handleBack("SELECT")}
								className="flex items-center font-exo text-white text-base gap-x-2 hover:text-white">
								<div className="bg-dark-gray-900 p-1 rounded-sm">
									<ChevronLeftMiniIcon className="w-6 h-6" />
								</div>{" "}
								Back
							</button>
						) : (
							title
						)}
					</DialogTitle>

					<DialogPrimitive.Close
						data-slot="dialog-close"
						className="hover:border border border-transparent hover:border-white hover:rounded-sm">
						<Close1Icon
							size={24}
							className="text-white fill-white"
							color="white"
						/>
						<span className="sr-only">Close</span>
					</DialogPrimitive.Close>
				</DialogHeader>
				{children}
			</DialogContent>
		</Dialog>
	);
};

export default CommonModal;
