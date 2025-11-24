import ClipIcon from "@/components/icon/Icon_Clip";
import React from "react";

interface FileUploadButtonProps {
	onFileSelect: (file: File) => void;
}

export const FileUploadButton: React.FC<FileUploadButtonProps> = ({
	onFileSelect,
}) => {
	const inputId = "file-upload-input";

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			onFileSelect(file);
		}
	};

	return (
		<div>
			<input
				id={inputId}
				type="file"
				className="sr-only"
				onChange={handleChange}
			/>

			<label
				htmlFor={inputId}
				className="p-2 rounded-full cursor-pointer text-white bg-white/10 border border-dark-gray-700 
                   inline-flex items-center justify-center transition-colors hover:bg-white/20"
				aria-label="Upload file"
			>
				<ClipIcon className="w-6 h-6" />
			</label>
		</div>
	);
};
