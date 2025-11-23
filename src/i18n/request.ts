import { getRequestConfig } from "next-intl/server";

import * as fs from "fs/promises";
import * as path from "path";
const ROOT_DIR = process.cwd();
const LOCALE_DIR = path.join(ROOT_DIR, "public", "locale");

async function loadMessages(locale: string) {
	console.log("LOCALE_DIR", LOCALE_DIR);

	const localePath = path.join(LOCALE_DIR, locale);
	let messages = {};

	try {
		const files = await fs.readdir(localePath);

		const jsonFiles = files.filter((file) => file.endsWith(".json"));

		for (const file of jsonFiles) {
			const filePath = path.join(localePath, file);
			const fileContent = await fs.readFile(filePath, "utf-8");
			const namespace = file.replace(".json", "");

			try {
				const jsonContent = JSON.parse(fileContent);
				messages = { ...messages, [namespace]: jsonContent };
			} catch (e) {
				console.error(`Error parsing JSON file ${file}:`, e);
			}
		}
	} catch (error) {
		console.error(`Could not load messages for locale ${locale}:`, error);
	}

	return messages;
}

export default getRequestConfig(async ({ locale = "en" }) => {
	const messages = await loadMessages(locale);

	// Trả về cấu hình
	return {
		locale,
		// Trả về messages đã gộp
		messages,
	};
});
