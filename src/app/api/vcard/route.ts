import { NextResponse } from "next/server";

const VCARD = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "FN:GRIDD",
  "ORG:GRIDD",
  "TEL;TYPE=CELL:+13138259887",
  "URL:https://gridd.click",
  "END:VCARD",
].join("\r\n");

export async function GET() {
  return new NextResponse(VCARD, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": 'attachment; filename="gridd.vcf"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}