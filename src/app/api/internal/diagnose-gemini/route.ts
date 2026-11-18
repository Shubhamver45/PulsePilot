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
  if (!authorized(request)) return NextResponse.json({error:"Not found"},{status:404});
  const apiKey = process.env.GEMINI_API_KEY || "";
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const keyTrimmed = apiKey.trim();
  const diagnostics = {
    geminiConfigured: Boolean(keyTrimmed && keyTrimmed !== "mock"),
    keyLength: keyTrimmed.length,
    keyHasLeadingOrTrailingWhitespace: apiKey !== keyTrimmed,
    keyContainsNewline: /[\r\n]/.test(apiKey),
    keyContainsEnvAssignment: /^\s*(?:export\s+)?GEMINI_API_KEY\s*=/.test(apiKey),
    modelNameValid: /^[a-zA-Z0-9._-]{1,64}$/.test(modelName),
    modelNameLength: modelName.length,
  };
  if (!diagnostics.geminiConfigured) {
    return NextResponse.json({verified:false,code:"GEMINI_NOT_CONFIGURED",diagnostics},{status:503});
  }

  try {
    const genAI = new GoogleGenerativeAI(keyTrimmed);
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {temperature:0,maxOutputTokens:8},
    });
    const response = await model.generateContent("Reply with exactly the single word READY.");
    return NextResponse.json({
      verified: response.response.text().trim().length > 0,
      code: "GEMINI_REQUEST_SUCCEEDED",
      diagnostics,
    });
  } catch (error: any) {
    const status = Number(error?.status || error?.response?.status || 0);
    const message = String(error?.message || "").toLowerCase();
    const code = status === 401 || status === 403
      ? "GEMINI_AUTH_OR_PERMISSION"
      : status === 400 && (message.includes("api key") || message.includes("api_key"))
      ? "GEMINI_INVALID_KEY"
      : status === 400
      ? "GEMINI_BAD_REQUEST"
      : status === 404 || message.includes("not found")
      ? "GEMINI_MODEL_NOT_FOUND"
      : status === 429
      ? "GEMINI_QUOTA_OR_RATE_LIMIT"
      : "GEMINI_REQUEST_FAILED";
    return NextResponse.json({verified:false,code,httpStatus:status || null,diagnostics},{status:502});
  }
}
