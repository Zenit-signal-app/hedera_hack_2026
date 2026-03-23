/**
 * Base URL cho AllOrigins `GET /get?url=` (RSS qua JSON `{ contents }`).
 * Dev: cùng origin qua proxy Vite → không lỗi CORS. Prod: gọi trực tiếp allorigins.
 */
export function getAlloriginsGetProxyPrefix(): string {
  if (import.meta.env.DEV) {
    return "/allorigins-proxy/get?url=";
  }
  return "https://api.allorigins.win/get?url=";
}
