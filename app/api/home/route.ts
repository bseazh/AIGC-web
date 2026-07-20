import { NextResponse } from "next/server";
import { inspirationCases } from "@/lib/inspiration";

export async function GET() {
  return NextResponse.json({ items: inspirationCases, source: "authorized-demo" });
}
