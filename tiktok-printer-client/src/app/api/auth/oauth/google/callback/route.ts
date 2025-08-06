import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const redirectUri = "http://localhost:3000/api/auth/oauth/google/callback";

    console.log("🔁 Received code:", code);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code || "",
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    console.log("🔑 tokenData:", tokenData);

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      throw new Error("No access token received");
    }

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const profile = await userRes.json();
    console.log("👤 profile:", profile);

    const jwtToken = jwt.sign(
      {
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    return NextResponse.redirect(`http://localhost:3000/dashboard?token=${jwtToken}`);
  } catch (error: any) {
    console.error("❌ OAuth callback error:", error);
    return NextResponse.json(
      { error: "OAuth callback failed", detail: error.message },
      { status: 500 }
    );
  }
}