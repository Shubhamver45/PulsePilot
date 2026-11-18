import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const expected = process.env.PULSE_PREVIEW_BOOTSTRAP_TOKEN || "";
  const provided = new URL(request.url).searchParams.get("token") || "";
  if (!expected || !provided) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const apiKey = process.env.GEMINI_API_KEY || "";
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!apiKey || apiKey === "mock") {
    return NextResponse.json({ verified: false, code: "GEMINI_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0, maxOutputTokens: 8 },
    });
    const result = await model.generateContent("Reply with exactly the single word READY.");
    const output = result.response.text().trim();
    return NextResponse.json({
      verified: output.length > 0,
      responseReceived: output.length > 0,
      model: "Gemini smoke test completed",
    });
  } catch (error: any) {
    const status = Number(error?.status || error?.response?.status || 0);
    const code = status === 401 || status === 403
      ? "GEMINI_AUTHENTICATION_FAILED"
      : status === 429
      ? "GEMINI_QUOTA_OR_RATE_LIMIT"
      : "GEMINI_REQUEST_FAILED";
    console.error("[Gemini smoke test] Request failed:", code);
    return NextResponse.json({ verified: false, code }, { status: 502 });
  }
}
