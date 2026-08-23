import { NextResponse } from "next/server";
import { isValidCodeShape } from "@/lib/affiliate/rules";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE } from "@/lib/affiliate/cookie";

export const dynamic = "force-dynamic";

// The share link: ionexa.ai/r/AB2C4XYZ
//
// It sets a cookie and redirects to signup. That is all it does, and the
// three things it deliberately does NOT do are the interesting part:
//
//   IT DOES NOT TOUCH THE DATABASE. An unauthenticated URL anybody can
//   hit a million times must not write a row per hit. Attribution happens
//   once, later, when an account actually exists — see
//   lib/affiliate/store.ts's attributeReferral.
//
//   IT DOES NOT VALIDATE THE CODE AGAINST THE TABLE. Same reason, plus a
//   second one: a lookup here would turn this into an oracle for
//   enumerating which codes are real. The shape is checked (so junk does
//   not become a cookie) and the code itself is resolved at signup.
//
//   IT DOES NOT REDIRECT ANYWHERE THE CODE ASKS FOR. The destination is
//   always /signup. A ?next= here would be an open redirect on a URL
//   designed to be shared by strangers.
export async function GET(request: Request, { params }: { params: { code: string } }) {
  const url = new URL(request.url);
  const code = params.code?.toUpperCase() ?? "";
  const destination = new URL("/signup", url.origin);

  const response = NextResponse.redirect(destination);
  if (isValidCodeShape(code)) {
    response.cookies.set({
      name: REFERRAL_COOKIE,
      value: code,
      // httpOnly so no script can read or forge it; the value is only ever
      // consumed server-side at signup.
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: REFERRAL_COOKIE_MAX_AGE,
    });
  }
  return response;
}
