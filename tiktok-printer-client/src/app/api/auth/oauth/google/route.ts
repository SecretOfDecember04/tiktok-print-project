// GET /api/auth/oauth/google
import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const redirectUri = encodeURIComponent(
    "http://localhost:3000/api/auth/oauth/google/callback"
  );
  const scope = encodeURIComponent("openid email profile");

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;

  return NextResponse.redirect(authUrl);
}