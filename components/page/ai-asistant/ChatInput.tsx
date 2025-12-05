// components/ChatInput.tsx
import React, { ChangeEvent, forwardRef, useState } from "react";
import MicroIcon from "@/components/icon/Icon_Microphone-mic";
import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import ArrowUpIcon from "@/components/icon/Icon_ArrowUp";
import Loader from "@/components/common/loading/loader";
import AiAskIcon from "@/components/icon/AiAskIcon";
import { FileUploadButton } from "@/components/common/input/Upload";
import { useReactMediaRecorder } from "react-media-recorder";
import { ChatRequestOptions } from "ai";
interface ChatInputProps {
	disabled: boolean;
	value: string;
	onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	handleSubmit: (
		event?:
			| {
					preventDefault?: (() => void) | undefined;
			  }
			| undefined,
		chatRequestOptions?: ChatRequestOptions | undefined
	) => void;
	onChange: (
		e: ChangeEvent<HTMLTextAreaElement> | ChangeEvent<HTMLInputElement>
	) => void;
}

const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(
	({ disabled, handleSubmit, ...props }, ref) => {
		return (
			<form
				onSubmit={handleSubmit}
				className="lg:w-full w-full flex justify-center backdrop-blur-sm rounded-3xl"
				style={{
					background:
						"linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0))",
				}}
			>
				<div className="w-full p-3 flex flex-col gap-y-4 bg-white/5 rounded-3xl border border-white/10 shadow-xl">
					<textarea
						ref={ref}
						className=" bg-transparent text-white placeholder-gray-500 text-base outline-none"
						placeholder="Ask a follow-up"
						disabled={disabled}
						{...props}
					/>

					<div className="flex items-center justify-between">
						<div className="flex items-center space-x-2 text-white py-2.5 px-3 cursor-pointer border w-max border-dark-gray-700 h-full rounded-full hover:bg-white/10 transition-colors">
							<AiAskIcon className="w-5 h-5 text-purple-400" />
							<span className="text-sm">AI Ask</span>
							<ChevronDownMini className="w-4 h-4" />
						</div>

						<div className="flex items-center space-x-2 pr-2">
							{/* <FileUploadButton
								onFileSelect={function (file: File): void {
									throw new Error(
										"Function not implemented."
									);
								}}
							/>
							<button
								type="button"
								onClick={toggleRecording}
								disabled={isProcessActive}
								className={`p-2 rounded-full border border-dark-gray-700 transition-colors ${
									isRecording
										? "bg-red-600 animate-pulse text-white"
										: "bg-white/10 text-white"
								}`}
							>
								<MicroIcon className="w-6 h-6" />
							</button> */}

							<button
								type="submit"
								disabled={!props.value.trim() || disabled}
								className={`p-2 rounded-full transition-colors ${
									disabled
										? "bg-gray-700 text-gray-400"
										: "bg-primary-700"
								}`}
							>
								<ArrowUpIcon className="w-6 h-6 text-white transform " />
							</button>
						</div>
					</div>
				</div>
			</form>
		);
	}
);

export default ChatInput