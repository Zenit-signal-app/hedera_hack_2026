import { NextResponse, NextRequest } from "next/server";

const BLOCKED_COUNTRY_CODE = "XX";
const BLOCKED_PAGE_PATH = "/ip-blocked";

export function middleware(request: NextRequest) {
	const country = request.geo?.country || "US";
	const currentPath = request.nextUrl.pathname;

	if (country === BLOCKED_COUNTRY_CODE) {
		if (currentPath === BLOCKED_PAGE_PATH) {
			return NextResponse.next();
		}

		const url = request.nextUrl.clone();
		url.pathname = BLOCKED_PAGE_PATH;

		return NextResponse.rewrite(url);
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!api|_next/static|_next/image|favicon.ico|manifest.json).*)",
	],
};
