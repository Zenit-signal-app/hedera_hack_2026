import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const BLOCKED_COUNTRY_CODE = "XX";
const BLOCKED_PAGE_PATH = "/ip-blocked";

export function middleware(request: NextRequest) {
	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-pathname", request.nextUrl.pathname);

	const country = request.geo?.country || "US";
	const currentPath = request.nextUrl.pathname;

	// Check if country is blocked
	if (country === BLOCKED_COUNTRY_CODE) {
		if (currentPath === BLOCKED_PAGE_PATH) {
			return NextResponse.next({
				request: {
					headers: requestHeaders,
				},
			});
		}

		const url = request.nextUrl.clone();
		url.pathname = BLOCKED_PAGE_PATH;

		return NextResponse.rewrite(url, {
			request: {
				headers: requestHeaders,
			},
		});
	}

	return NextResponse.next({
		request: {
			headers: requestHeaders,
		},
	});
}

export const config = {
	matcher: [
		/*
		 * Match all request paths except for the ones starting with:
		 * - api (API routes)
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico (favicon file)
		 * - manifest.json (PWA manifest)
		 */
		"/((?!api|_next/static|_next/image|favicon.ico|manifest.json).*)",
	],
};
