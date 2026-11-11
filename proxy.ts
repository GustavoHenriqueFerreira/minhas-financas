import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (mutating) {
    const origin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    if ((origin && origin !== request.nextUrl.origin) || fetchSite === "cross-site") {
      return NextResponse.json({ error: "Origem da requisição não permitida." }, { status: 403 });
    }
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Requisição muito grande." }, { status: 413 });
    }
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|service-worker.js).*)"],
};
