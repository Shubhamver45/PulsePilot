import { NextResponse } from "next/server";
import { loginUser, LoginInputSchema } from "@/lib/auth/auth-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = LoginInputSchema.parse(body);

    const result = await loginUser(input);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 401 });
    }

    const response = NextResponse.json({
      success: true,
      user: result.user,
      token: result.token,
      message: `Welcome back, ${result.user?.fullName}!`,
    });

    // Set secure HTTP-only session cookie
    response.cookies.set("pulsepilot_session", result.token || "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.errors ? err.errors[0].message : err.message },
      { status: 400 }
    );
  }
}

