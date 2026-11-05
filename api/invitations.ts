import { createClient } from "@supabase/supabase-js";

const getEnv = (key: string) =>
  (typeof process !== "undefined" && process.env ? process.env[key] : undefined) || "";

export async function processInvitationPayload(authHeader: string | undefined, body: any) {
  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY") || getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return { status: 500, data: { error: "Konfigurasi Supabase URL/Key belum diatur di server." } };
  }

  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return { status: 401, data: { error: "Unauthorized: Token sesi tidak ditemukan." } };
  }

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { status: 401, data: { error: "Sesi tidak valid atau telah berakhir." } };
  }

  const callerId = userData.user.id;

  // Periksa role pemanggil dari access_grants atau profiles
  const { data: profile } = await callerClient
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", callerId)
    .maybeSingle();

  const rawRole = (profile?.role || "").toLowerCase();
  const canonicalRole =
    rawRole === "super_admin" || rawRole === "superadmin"
      ? "superadmin"
      : rawRole === "admin" || rawRole === "admin_mahad"
      ? "admin"
      : rawRole === "musammi"
      ? "musammi"
      : "unknown";

  if (canonicalRole !== "superadmin" && canonicalRole !== "admin") {
    return { status: 403, data: { error: "Akses ditolak: Hanya Superadmin atau Admin Lembaga yang dapat mengundang pengguna." } };
  }

  const {
    email,
    password,
    fullName,
    role: requestedRoleInput,
    targetOrganizationId,
    mahadName,
    musammiId,
  } = body || {};

  if (!email || !fullName) {
    return { status: 400, data: { error: "Email dan Nama Lengkap wajib diisi." } };
  }

  const requestedRole =
    requestedRoleInput === "superadmin" || requestedRoleInput === "super_admin"
      ? "superadmin"
      : requestedRoleInput === "admin" || requestedRoleInput === "admin_mahad"
      ? "admin"
      : "musammi";

  // Admin Lembaga hanya boleh mengundang/membuat akun Musammi di dalam tenant-nya sendiri
  if (canonicalRole === "admin" && requestedRole === "superadmin") {
    return { status: 403, data: { error: "Admin Lembaga tidak diizinkan membuat akun Superadmin." } };
  }

  const resolvedOrgId =
    canonicalRole === "superadmin"
      ? targetOrganizationId || profile?.organization_id || null
      : profile?.organization_id || null;

  if (requestedRole !== "superadmin" && !resolvedOrgId && !mahadName) {
    return { status: 400, data: { error: "Organisasi/Tenant tujuan wajib ditentukan." } };
  }

  // Gunakan Admin Service Role jika tersedia, atau ephemeral server client yang terisolasi
  const privilegedClient = createClient(
    supabaseUrl,
    serviceRoleKey || supabaseAnonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );

  let createdUserId: string | null = null;

  if (serviceRoleKey) {
    const { data: adminCreated, error: adminErr } = await privilegedClient.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password: password || Math.random().toString(36).slice(-10) + "A1!",
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: requestedRole,
        target_organization_id: resolvedOrgId || "",
        mahad_name: mahadName || "",
      },
    });
    if (adminErr) {
      return { status: 400, data: { error: adminErr.message } };
    }
    createdUserId = adminCreated.user?.id || null;
  } else {
    const { data: signUpData, error: signUpErr } = await privilegedClient.auth.signUp({
      email: String(email).trim().toLowerCase(),
      password: password || Math.random().toString(36).slice(-10) + "A1!",
      options: {
        data: {
          full_name: fullName,
          role: requestedRole,
          target_organization_id: resolvedOrgId || "",
          mahad_name: mahadName || "",
        },
      },
    });
    if (signUpErr) {
      return { status: 400, data: { error: signUpErr.message } };
    }
    createdUserId = signUpData.user?.id || null;
  }

  if (!createdUserId) {
    return { status: 500, data: { error: "Gagal mendapatkan ID user baru dari layanan Auth." } };
  }

  // Tunggu sejenak bila trigger handle_new_user berjalan di database
  await new Promise((r) => setTimeout(r, 900));

  // Sinkronkan ke profiles (kompatibilitas) dan access_grants + user_profiles (V2 SaaS)
  const legacyRoleValue = requestedRole === "superadmin" ? "super_admin" : requestedRole;
  await callerClient
    .from("profiles")
    .update({
      full_name: fullName,
      email: String(email).trim().toLowerCase(),
      role: legacyRoleValue,
      ...(resolvedOrgId ? { organization_id: resolvedOrgId } : {}),
    })
    .eq("id", createdUserId);

  try {
    await callerClient.from("user_profiles").upsert(
      {
        user_id: createdUserId,
        full_name: fullName,
        email: String(email).trim().toLowerCase(),
      },
      { onConflict: "user_id" }
    );
  } catch {
    // Abaikan jika tabel V2 belum dijalankan di DB
  }

  try {
    await callerClient.from("access_grants").upsert(
      {
        user_id: createdUserId,
        organization_id: requestedRole === "superadmin" ? null : resolvedOrgId,
        role: requestedRole,
        status: "active",
        invited_by: callerId,
        invited_email: String(email).trim().toLowerCase(),
      },
      { onConflict: "organization_id,user_id" }
    );
  } catch {
    // Abaikan jika tabel V2 belum dijalankan
  }

  if (musammiId && resolvedOrgId) {
    await callerClient
      .from("musammi")
      .update({ user_id: createdUserId })
      .eq("id", musammiId)
      .eq("organization_id", resolvedOrgId);
  }

  try {
    await callerClient.from("audit_logs").insert({
      organization_id: resolvedOrgId,
      actor_id: callerId,
      actor_role: canonicalRole,
      action: "invite_user",
      resource_type: "access_grants",
      resource_id: createdUserId,
      after_state: {
        email: String(email).trim().toLowerCase(),
        full_name: fullName,
        role: requestedRole,
        musammi_id: musammiId || null,
      },
    });
  } catch {
    // Abaikan jika tabel audit_logs belum tersedia
  }

  return {
    status: 200,
    data: {
      success: true,
      userId: createdUserId,
      role: requestedRole,
      organizationId: resolvedOrgId,
    },
  };
}

// Default Web Standard / Vercel Serverless Handler
export default async function handler(req: any, res?: any) {
  // Support Express/Node (req, res) style on Vercel Node runtime
  if (res && typeof res.status === "function") {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }
    const result = await processInvitationPayload(req.headers?.authorization, req.body);
    return res.status(result.status).json(result.data);
  }

  // Support Edge / Web Fetch Request style (Vercel Edge & Netlify Functions)
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  const authHeader = req.headers?.get ? req.headers.get("authorization") : undefined;
  const body = await req.json().catch(() => ({}));
  const result = await processInvitationPayload(authHeader || undefined, body);
  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}
