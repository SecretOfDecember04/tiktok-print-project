import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  //not yet connected to a database, using hardcoded credentials for now
  if (!email || !password) {
    return NextResponse.json({ message: "Missing fields" }, { status: 400 });
  }

  const token = jwt.sign({ email }, process.env.JWT_SECRET!, { expiresIn: "7d" });

  return NextResponse.json({ token });
}