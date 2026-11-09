import { NextResponse } from "next/server";
import { demoPerformanceData } from "@/lib/db/repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "7D";

  const data = demoPerformanceData[range] || demoPerformanceData["7D"];

  return NextResponse.json({
    range,
    data,
    totalExposures: data.reduce((acc, d) => acc + d.exposures, 0),
    totalConversions: data.reduce((acc, d) => acc + d.conversions, 0),
    averageConversionRate:
      data.reduce((acc, d) => acc + d.conversionRate, 0) / (data.length || 1),
  });
}

