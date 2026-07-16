import { NextResponse } from "next/server";
import { heroImageWorkflow } from "@/lib/product-config";

export async function GET() {
  return NextResponse.json(heroImageWorkflow);
}
