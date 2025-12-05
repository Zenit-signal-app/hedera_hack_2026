// components/ChatInput.tsx
import React, { useState } from "react";
import MicroIcon from "@/components/icon/Icon_Microphone-mic";
import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import ArrowUpIcon from "@/components/icon/Icon_ArrowUp";
import Loader from "@/components/common/loading/loader";
import AiAskIcon from "@/components/icon/AiAskIcon";
import { FileUploadButton } from "@/components/common/input/Upload";
import { useReactMediaRecorder } from "react-media-recorder";
interface ChatInputProps {
	onSend: (message: string) => void;
	isLoading: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, isLoading }) => {
	const [input, setInput] = useState("");
	const [isTranscribing, setIsTranscribing] = useState(false);

	const isProcessActive = isLoading || isTranscribing;
	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (input.trim() && !isLoading) {
			onSend(input);
			setInput("");
		}
	};
	const { status, startRecording, stopRecording, mediaBlobUrl } =
		useReactMediaRecorder({
			video: false,
			audio: true,
		});
	const isRecording = status === "recording";
	const handleTranscript = async (blobUrl: string) => {
		setIsTranscribing(true);

		try {
			const audioBlob = await fetch(blobUrl).then((r) => r.blob());

			const formData = new FormData();
			formData.append("audio", audioBlob, "audio.webm");

			const response = await fetch("/api/speech-to-text", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				throw new Error("Speech-to-Text API failed");
			}

			const data = await response.json();

			// 3. Set Input với văn bản nhận được
			const transcript = data.transcript || "";
			setInput((prev) => (prev ? prev + " " : "") + transcript);
		} catch (error) {
			console.error("Error during transcription:", error);
			alert("Lỗi khi chuyển giọng nói thành văn bản.");
		} finally {
			setIsTranscribing(false);
		}
	};
	React.useEffect(() => {
		if (mediaBlobUrl) {
			handleTranscript(mediaBlobUrl);
		}
	}, [mediaBlobUrl]);
	const toggleRecording = () => {
		if (isRecording) {
			stopRecording();
		} else {
			startRecording();
		}
	};
	return (
		<form
			onSubmit={handleSubmit}
			className="lg:w-full w-[calc(100%-32px)] flex lg:static fixed bottom-0 left-4 justify-center backdrop-blur-sm rounded-3xl"
			style={{
				background:
					"linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0))",
			}}
		>
			<div className="w-full p-3 flex flex-col gap-y-4 bg-white/5 rounded-3xl border border-white/10 shadow-xl">
				<input
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					className=" bg-transparent text-white placeholder-gray-500 text-base outline-none"
					placeholder="Ask a follow-up"
					disabled={isLoading}
				/>

				<div className="flex items-center justify-between">
					<div className="flex items-center space-x-2 text-white py-2.5 px-3 cursor-pointer border w-max border-dark-gray-700 h-full rounded-full hover:bg-white/10 transition-colors">
						<AiAskIcon className="w-5 h-5 text-purple-400" />
						<span className="text-sm">AI Ask</span>
						<ChevronDownMini className="w-4 h-4" />
					</div>

					<div className="flex items-center space-x-2 pr-2">
						<FileUploadButton
							onFileSelect={function (file: File): void {
								throw new Error("Function not implemented.");
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
						</button>

						<button
							type="submit"
							disabled={!input.trim() || isLoading}
							className={`p-2 rounded-full transition-colors ${
								isLoading
									? "bg-gray-700 text-gray-400"
									: "bg-primary-700"
							}`}
						>
							{isLoading ? (
								<Loader />
							) : (
								<ArrowUpIcon className="w-6 h-6 text-white transform " />
							)}
						</button>
					</div>
				</div>
			</div>
		</form>
	);
};
