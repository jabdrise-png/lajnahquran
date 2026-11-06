import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { resolveServerTenantContext } from "./_tenantContext";

const getEnv = (key: string) =>
  (typeof process !== "undefined" && process.env ? process.env[key] : undefined) || "";

const generateSecureTempPassword = () => {
  return `${crypto.randomBytes(12).toString("base64url")}A1!`;
};

export const generateInvitationTokenPair = () => {
  const rawToken = `inv_${crypto.randomBytes(24).toString("hex")}`;
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
};

export async function processInvitationPayload(
  authHeader: string | undefined,
  body: any,
  injectedClient?: any
) {
  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY") || getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if ((!supabaseUrl || !supabaseAnonKey) && !injectedClient) {
    return { status: 500, data: { error: "Konfigurasi Supabase URL/Key belum diatur di server." } };
  }

  const requestedTargetOrg = body?.targetOrganizationId || body?.organizationId || null;

  const ctx = await resolveServerTenantContext({
    authHeader,
    requestedOrganizationId: requestedTargetOrg,
    requireWrite: true,
    requireOrganization: false,
    injectedClient,
  });

  if (!ctx.ok || !ctx.userId || !ctx.userClient) {
    return {
      status: ctx.status,
      data: { error: ctx.error || "Akses ditolak." },
    };
  }

  const callerClient = ctx.userClient;
  const callerId = ctx.userId;
  const canonicalRole = ctx.effectiveRole;
  const callerOrgId = ctx.organizationId;

  if (canonicalRole !== "superadmin" && canonicalRole !== "admin") {
    return {
      status: 403,
      data: { error: "Akses ditolak: Hanya Superadmin atau Admin Lembaga yang dapat mengundang pengguna." },
    };
  }

  // Dukungan pembatalan undangan (revoke) melalui endpoint yang sama
  if (body?.action === "revoke") {
    const { invitationId, grantId, reason } = body;
    if (!invitationId && !grantId) {
      return { status: 400, data: { error: "invitationId atau grantId wajib disertakan untuk membatalkan undangan." } };
    }
    const { data: revokeRes, error: revokeErr } = await callerClient.rpc("rpc_revoke_invitation", {
      p_invitation_id: invitationId || null,
      p_grant_id: grantId || null,
      p_reason: reason || "Undangan dibatalkan melalui API Invitations",
    });
    if (revokeErr) {
      return { status: 400, data: { error: revokeErr.message } };
    }
    return { status: 200, data: { success: true, ...revokeRes } };
  }

  const {
    email,
    password,
    fullName,
    role: requestedRoleInput,
    mahadName,
    musammiId,
    expiresInHours,
  } = body || {};

  if (!email || !fullName || !String(email).includes("@") || String(fullName).trim().length < 2) {
    return { status: 400, data: { error: "Email yang sah dan Nama Lengkap (minimal 2 karakter) wajib diisi." } };
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanFullName = String(fullName).trim();

  const requestedRole =
    requestedRoleInput === "superadmin" || requestedRoleInput === "super_admin"
      ? "superadmin"
      : requestedRoleInput === "admin" || requestedRoleInput === "admin_mahad"
      ? "admin"
      : "musammi";

  // KEPUTUSAN PRODUK & KEAMANAN (Bagian 1 & 2.A):
  // Admin Lembaga HANYA boleh mengundang/membuat akun dengan role 'musammi' pada organisasinya sendiri.
  // Hanya Superadmin yang dapat menetapkan role 'admin' atau 'superadmin'.
  if (canonicalRole === "admin" && requestedRole !== "musammi") {
    return {
      status: 403,
      data: {
        error:
          "Akses ditolak: Admin Lembaga hanya berwenang mengundang Musammi. Pembuatan akun Admin atau Superadmin hanya dapat dilakukan oleh Superadmin Platform.",
      },
    };
  }

  // Admin Lembaga tidak boleh mengundang pengguna untuk organisasi lain
  if (canonicalRole === "admin" && requestedTargetOrg && callerOrgId && requestedTargetOrg !== callerOrgId) {
    return {
      status: 403,
      data: { error: "Admin Lembaga hanya dapat mengundang pengguna ke dalam lembaganya sendiri." },
    };
  }

  const resolvedOrgId =
    canonicalRole === "superadmin"
      ? requestedTargetOrg || callerOrgId || null
      : callerOrgId || null;

  if (requestedRole !== "superadmin" && !resolvedOrgId && !mahadName) {
    return { status: 400, data: { error: "Organisasi/Tenant tujuan wajib ditentukan." } };
  }

  // Tolak password default lemah seperti Mahad123!
  if (typeof password === "string" && password.trim()) {
    const cleanPwd = password.trim();
    if (cleanPwd.toLowerCase() === "mahad123!" || cleanPwd.length < 8) {
      return {
        status: 400,
        data: {
          error:
            "Kata sandi terlalu lemah atau menggunakan sandi default yang dilarang. Gunakan minimal 8 karakter atau kosongkan agar sistem menggunakan mekanisme token undangan.",
        },
      };
    }
  }

  const isAutoGeneratedPassword = !(typeof password === "string" && password.trim().length >= 8);
  const effectivePassword = isAutoGeneratedPassword ? generateSecureTempPassword() : password.trim();
  // FASE 2 INVARIANT: Akun undangan selalu dibuat dalam status 'invited' sampai penerima mengonfirmasi token undangan di /invite
  const initialGrantStatus = "invited";

  const privilegedClient =
    injectedClient ||
    createClient(supabaseUrl, serviceRoleKey || supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  const mutationClient = serviceRoleKey ? privilegedClient : callerClient;

  let finalOrgId: string | null = resolvedOrgId;
  let provisionedNewTenant = false;

  const markProvisioningFailedIfApplicable = async (reason: string) => {
    if (finalOrgId && (provisionedNewTenant || body?.isTenantProvisioning)) {
      try {
        await callerClient.rpc("rpc_mark_tenant_provisioning_status", {
          p_organization_id: finalOrgId,
          p_status: "provisioning_failed",
          p_reason: reason,
        });
      } catch {
        try {
          await mutationClient
            .from("organizations")
            .update({ status: "provisioning_failed" })
            .eq("id", finalOrgId);
        } catch {
          // ignore best-effort status update
        }
      }
    }
  };

  // 1. Apabila Superadmin melakukan provisioning tenant baru sekaligus mengundang Admin
  if (!finalOrgId && mahadName && canonicalRole === "superadmin") {
    const { data: rpcOrg, error: rpcOrgErr } = await callerClient.rpc("rpc_create_tenant_with_admin", {
      p_name: String(mahadName).trim(),
      p_slug: body?.slug || null,
      p_timezone: body?.timezone || "Asia/Jakarta",
      p_plan_id: body?.planId || "standard",
      p_status: "provisioning",
    });
    if (rpcOrgErr || !rpcOrg?.id) {
      return {
        status: 500,
        data: { error: `Gagal menyiapkan tenant organisasi baru: ${rpcOrgErr?.message || "Unknown error"}` },
      };
    }
    finalOrgId = rpcOrg.id;
    provisionedNewTenant = true;
  }

  // 2. Validasi status organisasi tujuan sebelum membuat user
  if (finalOrgId) {
    const { data: orgRow, error: orgCheckErr } = await mutationClient
      .from("organizations")
      .select("id, name, status")
      .eq("id", finalOrgId)
      .maybeSingle();

    if (orgCheckErr || !orgRow) {
      return {
        status: 404,
        data: { error: "Organisasi/Tenant tujuan tidak ditemukan." },
      };
    }

    if (orgRow.status === "suspended" || orgRow.status === "archived") {
      return {
        status: 409,
        data: {
          error: `Tidak dapat mengirim undangan karena organisasi "${orgRow.name}" sedang berstatus ${orgRow.status.toUpperCase()}.`,
        },
      };
    }
  }

  // 3. Validasi hubungan Musammi dengan Master Musammi SEBELUM membuat akun Auth (cegah partial account creation)
  const parsedMusammiId =
    musammiId !== undefined && musammiId !== null && String(musammiId).trim() !== ""
      ? Number(musammiId)
      : null;

  if (parsedMusammiId !== null) {
    if (Number.isNaN(parsedMusammiId) || parsedMusammiId <= 0) {
      await markProvisioningFailedIfApplicable("ID profil Musammi tidak valid.");
      return { status: 400, data: { error: "ID profil Musammi tidak valid." } };
    }
    if (requestedRole !== "musammi" || !finalOrgId) {
      await markProvisioningFailedIfApplicable("Penautan Musammi hanya berlaku untuk role musammi di dalam tenant.");
      return {
        status: 400,
        data: { error: "Penautan profil Musammi hanya berlaku untuk undangan role Musammi pada organisasi yang valid." },
      };
    }

    const { data: musammiRow, error: musammiLookupErr } = await mutationClient
      .from("musammi")
      .select("id, nama, organization_id, user_id")
      .eq("id", parsedMusammiId)
      .eq("organization_id", finalOrgId)
      .maybeSingle();

    if (musammiLookupErr || !musammiRow) {
      return {
        status: 400,
        data: {
          error:
            "Profil Master Musammi tidak ditemukan di lembaga ini. Pastikan data Musammi terdaftar pada organisasi yang sama sebelum mengirim undangan.",
        },
      };
    }

    if (musammiRow.user_id) {
      return {
        status: 409,
        data: {
          error: `Profil Musammi "${musammiRow.nama}" sudah tertaut ke akun pengguna lain (${musammiRow.user_id.slice(0, 8)}...).`,
        },
      };
    }
  }

  // 4. Cek duplikasi email & status akun lama (mendukung retry/resend idempoten untuk status 'invited')
  let existingUserId: string | null = null;
  let existingGrant: any = null;

  const { data: existingProfile } = await mutationClient
    .from("profiles")
    .select("id, email, role, organization_id")
    .ilike("email", cleanEmail)
    .maybeSingle();

  if (existingProfile?.id) {
    existingUserId = existingProfile.id;
  } else {
    const { data: existingUserProfile } = await mutationClient
      .from("user_profiles")
      .select("user_id, email")
      .ilike("email", cleanEmail)
      .maybeSingle();
    if (existingUserProfile?.user_id) {
      existingUserId = existingUserProfile.user_id;
    }
  }

  if (existingUserId) {
    let grantQuery = mutationClient
      .from("access_grants")
      .select("id, user_id, organization_id, role, status")
      .eq("user_id", existingUserId);

    if (requestedRole === "superadmin") {
      grantQuery = grantQuery.is("organization_id", null).eq("role", "superadmin");
    } else if (finalOrgId) {
      grantQuery = grantQuery.eq("organization_id", finalOrgId);
    }

    const { data: foundGrant } = await grantQuery.maybeSingle();
    existingGrant = foundGrant;

    if (existingGrant) {
      if (existingGrant.status === "active") {
        return {
          status: 409,
          data: {
            error: `Email ${cleanEmail} sudah terdaftar dan berstatus AKTIF pada organisasi ini.`,
          },
        };
      }
      if (existingGrant.status === "suspended" || existingGrant.status === "revoked") {
        return {
          status: 409,
          data: {
            error: `Akun dengan email ${cleanEmail} memiliki status ${existingGrant.status.toUpperCase()}. Gunakan fitur Aktifkan Kembali pada manajemen akses jika ingin memulihkan akun.`,
          },
        };
      }
    }
  }

  // 5. Buat atau rekonsiliasi akun di Supabase Auth
  let targetUserId: string | null = existingUserId;
  let newlyCreatedAuthUser = false;

  if (!targetUserId) {
    if (serviceRoleKey) {
      const { data: adminCreated, error: adminErr } = await privilegedClient.auth.admin.createUser({
        email: cleanEmail,
        password: effectivePassword,
        email_confirm: true,
        user_metadata: {
          full_name: cleanFullName,
          role: requestedRole,
          target_organization_id: finalOrgId || "",
          mahad_name: mahadName || "",
          invitation_status: initialGrantStatus,
        },
      });
      if (adminErr) {
        await markProvisioningFailedIfApplicable(`Gagal membuat user Auth: ${adminErr.message}`);
        return { status: 400, data: { error: adminErr.message } };
      }
      targetUserId = adminCreated.user?.id || null;
      newlyCreatedAuthUser = Boolean(targetUserId);
    } else {
      const { data: signUpData, error: signUpErr } = await privilegedClient.auth.signUp({
        email: cleanEmail,
        password: effectivePassword,
        options: {
          data: {
            full_name: cleanFullName,
            role: requestedRole,
            target_organization_id: finalOrgId || "",
            mahad_name: mahadName || "",
            invitation_status: initialGrantStatus,
          },
        },
      });
      if (signUpErr) {
        await markProvisioningFailedIfApplicable(`Gagal mendaftarkan user Auth: ${signUpErr.message}`);
        return { status: 400, data: { error: signUpErr.message } };
      }
      targetUserId = signUpData.user?.id || null;
      newlyCreatedAuthUser = Boolean(targetUserId);
    }
  } else if (serviceRoleKey) {
    // Jika retry undangan untuk akun yang masih berstatus 'invited', sinkronkan password sementara & metadata terbaru
    await privilegedClient.auth.admin.updateUserById(targetUserId, {
      password: effectivePassword,
      user_metadata: {
        full_name: cleanFullName,
        role: requestedRole,
        target_organization_id: finalOrgId || "",
        mahad_name: mahadName || "",
        invitation_status: initialGrantStatus,
      },
    });
  }

  if (!targetUserId) {
    await markProvisioningFailedIfApplicable("Gagal mendapatkan ID user dari layanan Auth.");
    return { status: 500, data: { error: "Gagal mendapatkan ID user baru dari layanan Auth." } };
  }

  if (newlyCreatedAuthUser) {
    await new Promise((r) => setTimeout(r, 400));
  }

  const rollbackPartialCreation = async (reason: string) => {
    if (newlyCreatedAuthUser && serviceRoleKey && targetUserId) {
      try {
        await privilegedClient.auth.admin.deleteUser(targetUserId);
      } catch {
        // best-effort rollback
      }
    }
    await markProvisioningFailedIfApplicable(reason);
  };

  // 6. Sinkronkan profiles & user_profiles dalam status 'pending' (belum aktif sebelum undangan diterima)
  const { error: profileUpdateErr } = await mutationClient
    .from("profiles")
    .upsert(
      {
        id: targetUserId,
        full_name: cleanFullName,
        email: cleanEmail,
        role: "pending",
        ...(finalOrgId ? { organization_id: finalOrgId } : {}),
      },
      { onConflict: "id" }
    );

  if (profileUpdateErr && profileUpdateErr.code !== "42P01") {
    await rollbackPartialCreation(`Gagal memperbarui profiles: ${profileUpdateErr.message}`);
    return {
      status: 500,
      data: { error: `Gagal memperbarui profil pengguna (transaksi dibatalkan): ${profileUpdateErr.message}` },
    };
  }

  const { error: userProfileErr } = await mutationClient.from("user_profiles").upsert(
    {
      user_id: targetUserId,
      id: targetUserId,
      full_name: cleanFullName,
      email: cleanEmail,
      is_superadmin: false,
    },
    { onConflict: "user_id" }
  );

  if (userProfileErr && userProfileErr.code !== "42P01") {
    await rollbackPartialCreation(`Gagal menyinkronkan user_profiles: ${userProfileErr.message}`);
    return {
      status: 500,
      data: { error: `Gagal menyinkronkan user_profiles (transaksi dibatalkan): ${userProfileErr.message}` },
    };
  }

  // 7. Buat token undangan kriptografis sekali pakai (One-Time Invitation Token)
  const { rawToken, tokenHash } = generateInvitationTokenPair();
  const ttlHours =
    typeof expiresInHours === "number" && !Number.isNaN(expiresInHours)
      ? expiresInHours
      : 7 * 24;
  const expiresAtIso = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  // Upsert access_grants dengan status 'invited'
  const { data: upsertedGrant, error: grantErr } = await mutationClient
    .from("access_grants")
    .upsert(
      {
        user_id: targetUserId,
        organization_id: requestedRole === "superadmin" ? null : finalOrgId,
        role: requestedRole,
        status: initialGrantStatus,
        invited_by: callerId,
        invited_email: cleanEmail,
        invitation_token_hash: tokenHash,
        musammi_id: parsedMusammiId,
        expires_at: expiresAtIso,
        revoked_at: null,
      },
      { onConflict: "organization_id,user_id" }
    )
    .select("id")
    .maybeSingle();

  if (grantErr && grantErr.code !== "42P01") {
    await rollbackPartialCreation(`Gagal menetapkan access_grants: ${grantErr.message}`);
    return {
      status: 500,
      data: { error: `Gagal menetapkan hak akses access_grants (transaksi dibatalkan): ${grantErr.message}` },
    };
  }

  // Jika ada undangan pending sebelumnya untuk user + organisasi ini, tandai revoked agar hanya token terbaru yang berlaku
  try {
    let revokeOldQuery = mutationClient
      .from("tenant_invitations")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: callerId,
        updated_at: new Date().toISOString(),
      })
      .eq("email", cleanEmail)
      .eq("status", "pending");

    if (finalOrgId) {
      revokeOldQuery = revokeOldQuery.eq("organization_id", finalOrgId);
    } else {
      revokeOldQuery = revokeOldQuery.is("organization_id", null);
    }
    await revokeOldQuery;
  } catch {
    // Abaikan jika tabel tenant_invitations belum dimigrasikan pada environment lama
  }

  let invitationId: string | null = null;
  try {
    const { data: invRow, error: invErr } = await mutationClient
      .from("tenant_invitations")
      .insert({
        token_hash: tokenHash,
        email: cleanEmail,
        full_name: cleanFullName,
        role: requestedRole,
        organization_id: requestedRole === "superadmin" ? null : finalOrgId,
        user_id: targetUserId,
        musammi_id: parsedMusammiId,
        invited_by: callerId,
        status: "pending",
        expires_at: expiresAtIso,
      })
      .select("id")
      .single();

    if (invErr && invErr.code !== "42P01") {
      await rollbackPartialCreation(`Gagal mencatat token undangan: ${invErr.message}`);
      return {
        status: 500,
        data: { error: `Gagal menyimpan token undangan: ${invErr.message}` },
      };
    }
    invitationId = invRow?.id || null;
  } catch {
    // Fallback jika tabel tenant_invitations belum ada
  }

  // 8. Tautkan Musammi bila ditentukan
  if (parsedMusammiId !== null && finalOrgId) {
    const { error: musammiErr } = await mutationClient
      .from("musammi")
      .update({ user_id: targetUserId })
      .eq("id", parsedMusammiId)
      .eq("organization_id", finalOrgId);

    if (musammiErr && musammiErr.code !== "42P01") {
      await rollbackPartialCreation(`Gagal menautkan akun ke profil Musammi: ${musammiErr.message}`);
      return {
        status: 500,
        data: { error: `Gagal menautkan akun ke profil Musammi (transaksi dibatalkan): ${musammiErr.message}` },
      };
    }

    try {
      await mutationClient
        .from("musammi_staff")
        .update({ user_id: targetUserId, updated_at: new Date().toISOString() })
        .eq("legacy_musammi_id", parsedMusammiId)
        .eq("organization_id", finalOrgId);
    } catch {
      // ignore if musammi_staff not migrated yet
    }
  }

  // 9. Catat Audit Log
  try {
    await mutationClient.from("audit_logs").insert({
      organization_id: finalOrgId,
      actor_id: callerId,
      actor_role: canonicalRole,
      action: existingGrant ? "invitation.resent" : "invitation.created",
      resource_type: "tenant_invitations",
      resource_id: invitationId || upsertedGrant?.id || targetUserId,
      after_state: {
        email: cleanEmail,
        full_name: cleanFullName,
        role: requestedRole,
        status: initialGrantStatus,
        organization_id: finalOrgId,
        musammi_id: parsedMusammiId,
        expires_at: expiresAtIso,
        retried: Boolean(existingGrant),
      },
    });
  } catch {
    // Abaikan jika tabel audit_logs belum tersedia
  }

  const inviteAcceptPath = `/invite?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(cleanEmail)}${
    finalOrgId ? `&org=${encodeURIComponent(finalOrgId)}` : ""
  }`;

  return {
    status: 200,
    data: {
      success: true,
      userId: targetUserId,
      grantId: upsertedGrant?.id || existingGrant?.id || null,
      invitationId,
      invitationToken: rawToken,
      expiresAt: expiresAtIso,
      role: requestedRole,
      status: initialGrantStatus,
      organizationId: finalOrgId,
      retried: Boolean(existingGrant),
      temporaryPassword: isAutoGeneratedPassword ? effectivePassword : null,
      inviteAcceptPath,
    },
  };
}

export default async function handler(req: any, res?: any) {
  if (res && typeof res.status === "function") {
    if (req.method !== "POST" && req.method !== "DELETE") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }
    const payload = req.method === "DELETE" ? { ...req.body, action: "revoke" } : req.body;
    const result = await processInvitationPayload(req.headers?.authorization, payload);
    return res.status(result.status).json(result.data);
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  const authHeader = req.headers?.get ? req.headers.get("authorization") : undefined;
  const rawBody = await req.json().catch(() => ({}));
  const payload = req.method === "DELETE" ? { ...rawBody, action: "revoke" } : rawBody;
  const result = await processInvitationPayload(authHeader || undefined, payload);
  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}
