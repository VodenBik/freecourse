import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supportedInviteRoles = ["teacher", "student"] as const;
type InviteRole = (typeof supportedInviteRoles)[number];

function jsonError(code: string, status: number) {
  return NextResponse.json({ code }, { status });
}

function isInviteRole(value: unknown): value is InviteRole {
  return typeof value === "string" && supportedInviteRoles.includes(value as InviteRole);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) {
    return jsonError("invitationsNotConfigured", 503);
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) {
    return jsonError("unauthorized", 401);
  }

  const callerClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser(token);
  if (userError || !userData.user) {
    return jsonError("unauthorized", 401);
  }

  const { data: callerProfile, error: profileError } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError || callerProfile?.role !== "admin") {
    return jsonError("forbidden", 403);
  }

  let body: { email?: unknown; fullName?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("invalidInvitation", 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  if (!isEmail(email) || !fullName || !isInviteRole(body.role)) {
    return jsonError("invalidInvitation", 400);
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  });
  if (inviteError || !inviteData.user) {
    return jsonError("invitationFailed", 409);
  }

  const { error: upsertError } = await adminClient.from("profiles").upsert(
    {
      id: inviteData.user.id,
      email,
      full_name: fullName,
      role: body.role,
    },
    { onConflict: "id" },
  );
  if (upsertError) {
    return jsonError("invitationProfileFailed", 500);
  }

  return NextResponse.json({ ok: true });
}
