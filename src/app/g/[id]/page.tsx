import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  groups,
  groupMembers,
  pots,
  cycles,
  obligations,
  paymentClaims,
  confirmations,
} from "@/db/schema";
import { getLocale, t, type Dict } from "@/lib/i18n";
import { getSession } from "@/lib/session";
import { fmt, sum } from "@/lib/money";
import { addMember, openCycle, confirmClaim, rejectClaim } from "./actions";
import { CopyLink, WaButton } from "./client";

export const dynamic = "force-dynamic";

const statusLabel = (dict: Dict, s: string) =>
  s === "confirmed"
    ? dict.statusConfirmed
    : s === "claimed"
      ? dict.statusClaimed
      : s === "rejected"
        ? dict.statusRejected
        : dict.statusPending;

export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const groupId = Number((await params).id);
  const locale = await getLocale();
  const dict = t(locale);
  const d = db();

  const [group] = await d
    .select()
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.adminUserId, session.uid)));
  if (!group) redirect("/dashboard");

  const members = await d
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.archivedAt)));

  const [pot] = await d
    .select()
    .from(pots)
    .where(and(eq(pots.groupId, groupId), isNull(pots.archivedAt)));

  const collector = members.find((m) => m.id === pot?.collectorMemberId);
  const payerMembers = members.filter((m) => m.id !== pot?.collectorMemberId);
  const memberById = new Map(members.map((m) => [m.id, m]));

  const potCycles = pot
    ? await d
        .select()
        .from(cycles)
        .where(eq(cycles.potId, pot.id))
        .orderBy(desc(cycles.openedAt))
    : [];

  const cycleIds = potCycles.map((c) => c.id);
  const obs = cycleIds.length
    ? await d
        .select()
        .from(obligations)
        .where(inArray(obligations.cycleId, cycleIds))
    : [];

  const obIds = obs.map((o) => o.id);
  const claims = obIds.length
    ? await d
        .select()
        .from(paymentClaims)
        .where(inArray(paymentClaims.obligationId, obIds))
        .orderBy(desc(paymentClaims.claimedAt))
    : [];
  const claimIds = claims.map((c) => c.id);
  const confs = claimIds.length
    ? await d
        .select()
        .from(confirmations)
        .where(inArray(confirmations.paymentClaimId, claimIds))
        .orderBy(desc(confirmations.actedAt))
    : [];

  const latestClaimByOb = new Map<number, (typeof claims)[number]>();
  for (const c of claims) {
    if (!latestClaimByOb.has(c.obligationId)) latestClaimByOb.set(c.obligationId, c);
  }
  const confirmedClaimIds = new Set(confs.map((c) => c.paymentClaimId));

  // Pending = latest claim on a 'claimed' obligation with no confirmation yet.
  const pending = obs
    .filter((o) => o.status === "claimed")
    .map((o) => ({ ob: o, claim: latestClaimByOb.get(o.id) }))
    .filter(
      (x): x is { ob: (typeof obs)[number]; claim: (typeof claims)[number] } =>
        !!x.claim && !confirmedClaimIds.has(x.claim.id),
    );

  // Outstanding per member = obligations not yet confirmed.
  const outstandingByMember = new Map<number, string[]>();
  for (const o of obs) {
    if (o.status === "confirmed") continue;
    const arr = outstandingByMember.get(o.groupMemberId) ?? [];
    arr.push(o.amountDue);
    outstandingByMember.set(o.groupMemberId, arr);
  }

  const cycleById = new Map(potCycles.map((c) => [c.id, c]));
  const methodLabel = (m: string) => dict[m as "instapay" | "wallet" | "cash" | "bank" | "other"] ?? m;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{group.name}</h1>
          <p className="text-sm text-stone-500">
            {dict[group.type]} · {dict.collector}: {collector?.displayName}
          </p>
        </div>
        <a href="/dashboard" className="text-sm text-teal-700 underline">
          {dict.back}
        </a>
      </div>

      {/* Pending claims — collector's main job */}
      <section className="card">
        <h2 className="mb-3 text-lg font-bold">{dict.pendingClaims}</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-stone-500">{dict.noPending}</p>
        ) : (
          <ul className="space-y-3">
            {pending.map(({ ob, claim }) => (
              <li key={claim.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm">
                  <b>{memberById.get(ob.groupMemberId)?.displayName}</b>{" "}
                  · {cycleById.get(ob.cycleId)?.periodLabel} · {fmt(claim.amount, locale)} ·{" "}
                  {methodLabel(claim.method)}
                  {claim.referenceNumber && (
                    <span dir="ltr"> · #{claim.referenceNumber}</span>
                  )}
                  {" · "}{claim.paidDate}
                </p>
                {claim.note && <p className="mt-1 text-xs text-stone-600">{claim.note}</p>}
                <div className="mt-2 flex gap-2">
                  <form action={confirmClaim} className="flex flex-1 gap-2">
                    <input type="hidden" name="groupId" value={groupId} />
                    <input type="hidden" name="claimId" value={claim.id} />
                    <input name="note" placeholder={dict.optionalNote} className="input flex-1 py-1.5 text-sm" />
                    <button className="btn-primary text-xs">{dict.confirmBtn}</button>
                  </form>
                  <form action={rejectClaim}>
                    <input type="hidden" name="groupId" value={groupId} />
                    <input type="hidden" name="claimId" value={claim.id} />
                    <button className="btn-danger text-xs">{dict.rejectBtn}</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Balances */}
      {payerMembers.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-lg font-bold">{dict.balances}</h2>
          <ul className="divide-y divide-stone-100">
            {payerMembers.map((m) => {
              const out = outstandingByMember.get(m.id) ?? [];
              const total = sum(out);
              const settled = out.length === 0;
              return (
                <li key={m.id} className="flex items-center justify-between py-2">
                  <span>{m.displayName}</span>
                  {settled ? (
                    <span className="badge-confirmed">{dict.settled}</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-red-700">{fmt(total, locale)}</span>
                      <WaButton
                        phone={m.phone}
                        template={`${dict.waReminderMsg} ${fmt(total, locale)} — ${group.name}. {link}`}
                        path={`/m/${m.accessToken}`}
                        label={dict.remind}
                      />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Cycles + obligations */}
      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{dict.cycles}</h2>
        </div>
        {potCycles.length === 0 && <p className="mb-3 text-sm text-stone-500">{dict.noCycles}</p>}
        <div className="space-y-4">
          {potCycles.map((cy) => (
            <div key={cy.id} className="rounded-lg border border-stone-200 p-3">
              <p className="mb-2 font-semibold">
                {cy.periodLabel}
                {cy.dueDate && <span className="ms-2 text-xs font-normal text-stone-500">{dict.dueDate}: {cy.dueDate}</span>}
              </p>
              <ul className="divide-y divide-stone-100 text-sm">
                {obs
                  .filter((o) => o.cycleId === cy.id)
                  .map((o) => (
                    <li key={o.id} className="flex items-center justify-between py-1.5">
                      <span>{memberById.get(o.groupMemberId)?.displayName}</span>
                      <span className="flex items-center gap-2">
                        <span>{fmt(o.amountDue, locale)}</span>
                        <span className={`badge-${o.status}`}>{statusLabel(dict, o.status)}</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>

        {pot && payerMembers.length > 0 && (
          <form action={openCycle} className="mt-4 space-y-3 border-t border-stone-200 pt-4">
            <h3 className="font-semibold">{dict.newCycle}</h3>
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="potId" value={pot.id} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="label">{dict.periodLabel}</label>
                <input name="periodLabel" className="input" required maxLength={40} />
              </div>
              <div>
                <label className="label">{dict.amountPerMember}</label>
                <input name="amount" inputMode="decimal" dir="ltr" className="input" required />
              </div>
              <div>
                <label className="label">{dict.dueDate}</label>
                <input name="dueDate" type="date" className="input" />
              </div>
            </div>
            <button className="btn-primary">{dict.openCycle}</button>
          </form>
        )}
      </section>

      {/* Members + token links */}
      <section className="card">
        <h2 className="mb-3 text-lg font-bold">{dict.members}</h2>
        <ul className="mb-4 space-y-2">
          {payerMembers.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 p-2">
              <span>
                {m.displayName}
                {m.phone && <span className="ms-2 text-xs text-stone-400" dir="ltr">{m.phone}</span>}
              </span>
              <span className="flex gap-2">
                <CopyLink path={`/m/${m.accessToken}`} label={dict.copyLink} copiedLabel={dict.copied} />
                <WaButton
                  phone={m.phone}
                  template={`${dict.waMemberLinkMsg} "${group.name}": {link}`}
                  path={`/m/${m.accessToken}`}
                  label={dict.shareLink}
                />
              </span>
            </li>
          ))}
        </ul>
        <form action={addMember} className="space-y-3 border-t border-stone-200 pt-4">
          <h3 className="font-semibold">{dict.addMember}</h3>
          <input type="hidden" name="groupId" value={groupId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">{dict.name}</label>
              <input name="name" className="input" required maxLength={80} />
            </div>
            <div>
              <label className="label">{dict.phoneOptional}</label>
              <input name="phone" type="tel" dir="ltr" className="input" />
            </div>
          </div>
          <button className="btn-primary">{dict.addMember}</button>
        </form>
      </section>
    </div>
  );
}
