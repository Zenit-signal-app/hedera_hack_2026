import { NextURL } from "next/dist/server/web/next-url";

declare module "next/server" {
	interface NextRequest {
		geo?: {
			city?: string;
			country?: string;
			region?: string;
			latitude?: string;
			longitude?: string;
		};
		ip?: string;
		nextUrl: NextURL;
	}
}
