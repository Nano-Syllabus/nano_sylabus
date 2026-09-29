import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureCommunityLearningSpace } from "@/lib/community-learning";
import { CommunityError, PUBLIC_COMMUNITIES_MEMO } from "@/lib/data/communities";
import { invalidateMemo } from "@/lib/http/memo";
import { invalidateStudentCourseAccess } from "@/lib/student-courses";
import { emailConfigured, escapeHtml, sendEmail } from "@/lib/email";
import { getCanonicalBaseUrl } from "@/lib/site";

/**
 * Hand a faculty to one of its members. The creator picks an active member,
 * that member is emailed a one-time link, and ownership moves only when the
 * member accepts it while signed in to that account
 * (supabase/migrations/20260929150000_community_ownership_transfer.sql).
 */

export const OWNERSHIP_TRANSFER_TTL_DAYS = 7;

export type OwnershipTransferCandidate = { userId: string; name: string };

export type PendingOwnershipTransfer = {
  toUserId: string;
  toName: string;
  toEmail: string;
  expiresAt: string;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function validTransferToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** `benjamin@gmail.com` → `be••••••@gmail.com`: enough for the sender to recognise it. */
export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "";
  return `${local.slice(0, Math.min(2, local.length - 1) || 1)}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

function missingTable(error: { code?: string } | null) {
  return ["42P01", "PGRST205", "PGRST202", "42883"].includes(String(error?.code || ""));
}

function notInstalled(): never {
  throw new CommunityError(
    "Ownership transfer is not available yet. The database update must be installed first.",
    503,
  );
}

async function ownedCommunity(admin: SupabaseClient, userId: string, slug: string) {
  const result = await admin
    .from("communities")
    .select("id,slug,name,creator_id")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new CommunityError("Community not found.", 404);
  if (String(result.data.creator_id) !== userId) {
    throw new CommunityError("Only the community creator can transfer ownership.", 403);
  }
  return {
    id: String(result.data.id),
    slug: String(result.data.slug),
    name: String(result.data.name),
  };
}

async function displayNames(admin: SupabaseClient, userIds: string[]) {
  if (!userIds.length) return new Map<string, string>();
  const result = await admin
    .from("student_profiles")
    .select("user_id,full_name")
    .in("user_id", userIds);
  if (result.error) throw result.error;
  return new Map(
    (result.data || [])
      .filter((row) => String(row.full_name || "").trim())
      .map((row) => [String(row.user_id), String(row.full_name).trim()]),
  );
}

async function accountOf(admin: SupabaseClient, userId: string) {
  const result = await admin.auth.admin.getUserById(userId);
  if (result.error) throw result.error;
  const user = result.data.user;
  const metadataName =
    typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  return { email: user?.email?.trim() || "", metadataName };
}

async function pendingTransfer(admin: SupabaseClient, communityId: string) {
  const result = await admin
    .from("community_ownership_transfers")
    .select("id,to_user_id,expires_at")
    .eq("community_id", communityId)
    .eq("status", "pending")
    .maybeSingle();
  if (missingTable(result.error)) notInstalled();
  if (result.error) throw result.error;
  return result.data;
}

/** What the Danger zone needs: the live offer, if any, and who could receive one. */
export async function getOwnershipTransferState(userId: string, slug: string) {
  const admin = createSupabaseAdminClient();
  const community = await ownedCommunity(admin, userId, slug);
  const [offer, members] = await Promise.all([
    pendingTransfer(admin, community.id),
    admin
      .from("community_memberships")
      .select("user_id,joined_at")
      .eq("community_id", community.id)
      .eq("status", "active")
      .neq("user_id", userId)
      .order("joined_at", { ascending: false })
      .limit(500),
  ]);
  if (members.error) throw members.error;
  const memberIds = (members.data || []).map((row) => String(row.user_id));
  const names = await displayNames(admin, memberIds);
  const candidates: OwnershipTransferCandidate[] = memberIds.map((id) => ({
    userId: id,
    name: names.get(id) || "Community member",
  }));

  let pending: PendingOwnershipTransfer | null = null;
  if (offer) {
    const toUserId = String(offer.to_user_id);
    const account = await accountOf(admin, toUserId);
    pending = {
      toUserId,
      toName: names.get(toUserId) || account.metadataName || "Community member",
      toEmail: maskEmail(account.email),
      expiresAt: String(offer.expires_at),
    };
  }
  return { pending, candidates };
}

function transferEmail(input: {
  communityName: string;
  fromName: string;
  toName: string;
  link: string;
}) {
  const community = escapeHtml(input.communityName);
  const from = escapeHtml(input.fromName);
  const to = escapeHtml(input.toName);
  const link = escapeHtml(input.link);
  const subject = `${input.fromName} wants to make you the owner of ${input.communityName}`;
  const text = [
    `Hi ${input.toName},`,
    "",
    `${input.fromName} wants to transfer ownership of the ${input.communityName} community on NanoSyllabus to you.`,
    "As the owner you manage its subjects, members and settings.",
    "",
    `Review and accept the transfer: ${input.link}`,
    "",
    `The link works for ${OWNERSHIP_TRANSFER_TTL_DAYS} days and only for your account. If you weren't expecting this, you can ignore this email or decline it from the link.`,
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;background:#f6f6f4;font-family:Arial,Helvetica,sans-serif;color:#111">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:16px;padding:28px">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#777">Transfer ownership</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${community}</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6">Hi ${to},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6"><strong>${from}</strong> wants to make you the owner of <strong>${community}</strong> on NanoSyllabus. As the owner you manage its subjects, members and settings.</p>
      <p style="margin:24px 0"><a href="${link}" style="display:inline-block;background:#0e2a5c;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">Review transfer</a></p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#666">The link works for ${OWNERSHIP_TRANSFER_TTL_DAYS} days and only for your account. If you weren't expecting this, ignore this email or decline from the link.</p>
    </div>
  </div>
</body></html>`;
  return { subject, text, html };
}

/**
 * Offer the faculty to a member, confirmed by its NAME typed out (as delete is).
 * Any earlier pending offer is cancelled. Returns `devLink` only when email is
 * not configured outside production, so the flow can be tried locally.
 */
export async function startOwnershipTransfer(input: {
  userId: string;
  slug: string;
  toUserId: string;
  confirmation: string;
  requestOrigin: string;
}) {
  const production = process.env.NODE_ENV === "production";
  if (production && !emailConfigured()) {
    throw new CommunityError("Email is not set up on this server, so the transfer cannot be sent.", 503);
  }
  const admin = createSupabaseAdminClient();
  const community = await ownedCommunity(admin, input.userId, input.slug);
  const clean = (value: string) => value.trim().replace(/\s+/g, " ");
  if (!clean(input.confirmation) || clean(input.confirmation) !== clean(community.name)) {
    throw new CommunityError("Type the community name exactly to confirm the transfer.", 400);
  }
  if (input.toUserId === input.userId) {
    throw new CommunityError("Choose another member to transfer ownership to.", 400);
  }
  const membership = await admin
    .from("community_memberships")
    .select("user_id")
    .eq("community_id", community.id)
    .eq("user_id", input.toUserId)
    .eq("status", "active")
    .maybeSingle();
  if (membership.error) throw membership.error;
  if (!membership.data) {
    throw new CommunityError("That person is not an active member of this community.", 400);
  }

  const [recipient, sender, names] = await Promise.all([
    accountOf(admin, input.toUserId),
    accountOf(admin, input.userId),
    displayNames(admin, [input.toUserId, input.userId]),
  ]);
  if (!recipient.email) {
    throw new CommunityError("That member has no email address on their account.", 409);
  }

  const cancel = await admin
    .from("community_ownership_transfers")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("community_id", community.id)
    .eq("status", "pending");
  if (missingTable(cancel.error)) notInstalled();
  if (cancel.error) throw cancel.error;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + OWNERSHIP_TRANSFER_TTL_DAYS * 86_400_000).toISOString();
  const insert = await admin
    .from("community_ownership_transfers")
    .insert({
      community_id: community.id,
      from_user_id: input.userId,
      to_user_id: input.toUserId,
      token_hash: hashToken(token),
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (insert.error?.code === "23505") {
    throw new CommunityError("Another transfer was just sent for this community. Refresh and try again.", 409);
  }
  if (insert.error) throw insert.error;

  // The canonical site in production, so a forged Host header can never
  // put another domain into the email; the request's own origin locally.
  const base = production ? getCanonicalBaseUrl() : input.requestOrigin.replace(/\/+$/, "");
  const link = `${base}/communities/transfer/${token}`;
  const toName = names.get(input.toUserId) || recipient.metadataName || "there";
  const fromName =
    names.get(input.userId) || sender.metadataName || "The community creator";

  let devLink: string | undefined;
  if (emailConfigured()) {
    try {
      await sendEmail({
        to: recipient.email,
        ...transferEmail({ communityName: community.name, fromName, toName, link }),
      });
    } catch (error) {
      // No email went out, so the offer must not stay open.
      await admin
        .from("community_ownership_transfers")
        .update({ status: "cancelled", responded_at: new Date().toISOString() })
        .eq("id", insert.data.id);
      throw new CommunityError(
        error instanceof Error ? `${error.message} Try again.` : "The email could not be sent.",
        502,
      );
    }
  } else {
    console.info(`[ownership-transfer] email not configured; accept link: ${link}`);
    devLink = link;
  }

  return {
    pending: {
      toUserId: input.toUserId,
      toName: names.get(input.toUserId) || recipient.metadataName || "Community member",
      toEmail: maskEmail(recipient.email),
      expiresAt,
    } satisfies PendingOwnershipTransfer,
    devLink,
  };
}

export async function cancelOwnershipTransfer(userId: string, slug: string) {
  const admin = createSupabaseAdminClient();
  const community = await ownedCommunity(admin, userId, slug);
  const result = await admin
    .from("community_ownership_transfers")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("community_id", community.id)
    .eq("status", "pending");
  if (missingTable(result.error)) notInstalled();
  if (result.error) throw result.error;
  return { cancelled: true };
}

export type OwnershipTransferView = {
  community: { slug: string; name: string; university: string; faculty: string };
  fromName: string;
  toUserId: string;
  expiresAt: string;
  state: "pending" | "expired" | "accepted" | "declined" | "cancelled";
};

/** The accept page's read. Null for an unknown token. */
export async function getOwnershipTransferByToken(
  token: string,
): Promise<OwnershipTransferView | null> {
  if (!validTransferToken(token)) return null;
  const admin = createSupabaseAdminClient();
  const offer = await admin
    .from("community_ownership_transfers")
    .select("community_id,from_user_id,to_user_id,status,expires_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (missingTable(offer.error)) return null;
  if (offer.error) throw offer.error;
  if (!offer.data) return null;
  const [community, names, sender] = await Promise.all([
    admin
      .from("communities")
      .select("slug,name,university,faculty,status,creator_id")
      .eq("id", offer.data.community_id)
      .maybeSingle(),
    displayNames(admin, [String(offer.data.from_user_id)]),
    accountOf(admin, String(offer.data.from_user_id)),
  ]);
  if (community.error) throw community.error;
  if (!community.data) return null;

  let state = String(offer.data.status) as OwnershipTransferView["state"];
  if (state === "pending") {
    const stale =
      community.data.status !== "active" ||
      String(community.data.creator_id) !== String(offer.data.from_user_id);
    if (stale) state = "cancelled";
    else if (new Date(String(offer.data.expires_at)).getTime() <= Date.now()) state = "expired";
  }
  return {
    community: {
      slug: String(community.data.slug),
      name: String(community.data.name),
      university: String(community.data.university),
      faculty: String(community.data.faculty),
    },
    fromName:
      names.get(String(offer.data.from_user_id)) || sender.metadataName || "The community creator",
    toUserId: String(offer.data.to_user_id),
    expiresAt: String(offer.data.expires_at),
    state,
  };
}

export async function respondToOwnershipTransfer(
  userId: string,
  token: string,
  action: "accept" | "decline",
) {
  if (!validTransferToken(token)) throw new CommunityError("This transfer link is not valid.", 404);
  const admin = createSupabaseAdminClient();
  const tokenHash = hashToken(token);

  if (action === "decline") {
    const result = await admin
      .from("community_ownership_transfers")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)
      .eq("to_user_id", userId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (missingTable(result.error)) notInstalled();
    if (result.error) throw result.error;
    if (!result.data) throw new CommunityError("This transfer is no longer open.", 409);
    return { declined: true };
  }

  const { data, error } = await admin.rpc("accept_community_ownership_transfer", {
    target_user_id: userId,
    target_token_hash: tokenHash,
  });
  if (error) {
    if (missingTable(error)) notInstalled();
    if (error.code === "P0002") throw new CommunityError(error.message, 404);
    if (error.code === "42501") throw new CommunityError(error.message, 403);
    if (error.code === "22023") throw new CommunityError(error.message, 409);
    throw error;
  }
  const slug = String(data || "");

  invalidateMemo(PUBLIC_COMMUNITIES_MEMO);
  invalidateStudentCourseAccess(userId);
  // Gives the new owner a creator collection and study-course enrollment, as
  // creating a faculty does. Best effort: ownership has already moved, and the
  // workspace provisions the same on first visit.
  try {
    const community = await admin.from("communities").select("id").eq("slug", slug).maybeSingle();
    if (community.data?.id) await ensureCommunityLearningSpace(admin, String(community.data.id));
  } catch (provisionError) {
    console.error("[ownership-transfer] provisioning the new owner failed", provisionError);
  }
  return { accepted: true, slug };
}
