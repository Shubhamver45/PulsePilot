import { NextResponse } from "next/server";
import { registerUser, RegisterInputSchema } from "@/lib/auth/auth-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = RegisterInputSchema.parse(body);

    const result = await registerUser(input);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    const response = NextResponse.json({
      success: true,
      user: result.user,
      token: result.token,
      message: `Account created successfully for ${result.user?.fullName}.`,
    });

    response.cookies.set("pulsepilot_session", result.token || "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
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

