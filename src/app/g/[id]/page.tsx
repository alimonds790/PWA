import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  groupMembers,
  pots,
  potMembers,
  cycles,
  obligations,
  paymentClaims,
  confirmations,
} from "@/db/schema";
import { getLocale, t, type Dict } from "@/lib/i18n";
import { getSession } from "@/lib/session";
import { getGroupAccess } from "@/lib/authz";
import { fmt, sum } from "@/lib/money";
import {
  addMember,
  createPot,
  openCycle,
  confirmClaim,
  rejectClaim,
  rotateMemberToken,
} from "./actions";
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

/** next YYYY-MM after the latest YYYY-MM cycle label, else current month */
function nextPeriodLabel(labels: string[], recurrence: string): string {
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (recurrence !== "monthly") return "";
  const monthly = labels.filter((l) => /^\d{4}-\d{2}$/.test(l)).sort();
  const last = monthly[monthly.length - 1];
  if (!last) return cur;
  const [y, m] = last.split("-").map(Number);
  const next = new Date(y, m, 1); // m is 1-based → this is the next month
  const label = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  return label > cur ? label : cur;
}

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

  const access = await getGroupAccess(groupId, session);
  if (!access) redirect("/dashboard");
  const { group, isAdmin, collectorPotIds } = access;

  const members = await d
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.archivedAt)));
  const memberById = new Map(members.map((m) => [m.id, m]));

  const groupPots = await d
    .select()
    .from(pots)
    .where(and(eq(pots.groupId, groupId), isNull(pots.archivedAt)))
    .orderBy(pots.id);
  const multiPot = groupPots.length > 1;

  const potIds = groupPots.map((p) => p.id);
  const pm = potIds.length
    ? await d.select().from(potMembers).where(inArray(potMembers.potId, potIds))
    : [];
  const potCycles = potIds.length
    ? await d
        .select()
        .from(cycles)
        .where(inArray(cycles.potId, potIds))
        .orderBy(desc(cycles.openedAt))
    : [];
  const cycleIds = potCycles.map((c) => c.id);
  const obs = cycleIds.length
    ? await d.select().from(obligations).where(inArray(obligations.cycleId, cycleIds))
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
    : [];

  const latestClaimByOb = new Map<number, (typeof claims)[number]>();
  for (const c of claims) {
    if (!latestClaimByOb.has(c.obligationId)) latestClaimByOb.set(c.obligationId, c);
  }
  const confirmedClaimIds = new Set(confs.map((c) => c.paymentClaimId));
  const cycleById = new Map(potCycles.map((c) => [c.id, c]));
  const methodLabel = (m: string) =>
    dict[m as "instapay" | "wallet" | "cash" | "bank" | "other"] ?? m;

  const collectorMemberIds = new Set(groupPots.map((p) => p.collectorMemberId));
  const payerMembers = members.filter((m) => !collectorMemberIds.has(m.id) || multiPot);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{group.name}</h1>
          <p className="text-sm text-stone-500">
            {dict[group.type]}
            {!multiPot && groupPots[0] && (
              <> · {dict.collector}: {memberById.get(groupPots[0].collectorMemberId)?.displayName}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href={`/g/${groupId}/print`} className="text-sm text-teal-700 underline">
            {dict.exportRecord}
          </a>
          <a href="/dashboard" className="text-sm text-teal-700 underline">
            {dict.back}
          </a>
        </div>
      </div>

      {groupPots.map((pot) => {
        const potPayerIds = new Set(
          pm.filter((x) => x.potId === pot.id).map((x) => x.groupMemberId),
        );
        const potCyclesHere = potCycles.filter((c) => c.potId === pot.id);
        const potCycleIds = new Set(potCyclesHere.map((c) => c.id));
        const potObs = obs.filter((o) => potCycleIds.has(o.cycleId));
        const canConfirm = collectorPotIds.has(pot.id);
        const canOpenCycle = isAdmin || canConfirm;
        const collector = memberById.get(pot.collectorMemberId);

        const pending = potObs
          .filter((o) => o.status === "claimed")
          .map((o) => ({ ob: o, claim: latestClaimByOb.get(o.id) }))
          .filter(
            (x): x is { ob: (typeof obs)[number]; claim: (typeof claims)[number] } =>
              !!x.claim && !confirmedClaimIds.has(x.claim.id),
          );

        const outstandingByMember = new Map<number, string[]>();
        for (const o of potObs) {
          if (o.status === "confirmed") continue;
          const arr = outstandingByMember.get(o.groupMemberId) ?? [];
          arr.push(o.amountDue);
          outstandingByMember.set(o.groupMemberId, arr);
        }
        const potPayers = members.filter((m) => potPayerIds.has(m.id));
        const suggestedLabel = nextPeriodLabel(
          potCyclesHere.map((c) => c.periodLabel),
          pot.recurrence,
        );

        return (
          <section key={pot.id} className="space-y-4">
            {multiPot && (
              <h2 className="border-b border-stone-300 pb-1 text-lg font-bold">
                {pot.name}
                <span className="ms-2 text-sm font-normal text-stone-500">
                  {dict.collector}: {collector?.displayName}
                </span>
              </h2>
            )}

            {/* Pending claims for this pot */}
            <div className="card">
              <h3 className="mb-3 font-bold">{dict.pendingClaims}</h3>
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
                        {claim.referenceNumber && <span dir="ltr"> · #{claim.referenceNumber}</span>}
                        {" · "}{claim.paidDate}
                      </p>
                      {claim.note && <p className="mt-1 text-xs text-stone-600">{claim.note}</p>}
                      {canConfirm ? (
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
                      ) : (
                        <p className="mt-1 text-xs text-stone-500">
                          {dict.collector}: {collector?.displayName}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Balances for this pot */}
            {potPayers.length > 0 && (
              <div className="card">
                <h3 className="mb-3 font-bold">{dict.balances}</h3>
                <ul className="divide-y divide-stone-100">
                  {potPayers.map((m) => {
                    const out = outstandingByMember.get(m.id) ?? [];
                    const total = sum(out);
                    return (
                      <li key={m.id} className="flex items-center justify-between py-2">
                        <span>{m.displayName}</span>
                        {out.length === 0 ? (
                          <span className="badge-confirmed">{dict.settled}</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="font-semibold text-red-700">{fmt(total, locale)}</span>
                            <WaButton
                              phone={m.phone}
                              template={`${dict.waReminderMsg} ${fmt(total, locale)} — ${multiPot ? pot.name : group.name}. {link}`}
                              path={`/m/${m.accessToken}`}
                              label={dict.remind}
                            />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Cycles + obligations */}
            <div className="card">
              <h3 className="mb-3 font-bold">{dict.cycles}</h3>
              {potCyclesHere.length === 0 && (
                <p className="mb-3 text-sm text-stone-500">{dict.noCycles}</p>
              )}
              <div className="space-y-4">
                {potCyclesHere.map((cy) => (
                  <div key={cy.id} className="rounded-lg border border-stone-200 p-3">
                    <p className="mb-2 font-semibold">
                      {cy.periodLabel}
                      {cy.dueDate && (
                        <span className="ms-2 text-xs font-normal text-stone-500">
                          {dict.dueDate}: {cy.dueDate}
                        </span>
                      )}
                    </p>
                    <ul className="divide-y divide-stone-100 text-sm">
                      {potObs
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

              {canOpenCycle && potPayers.length > 0 && (
                <form action={openCycle} className="mt-4 space-y-3 border-t border-stone-200 pt-4">
                  <h4 className="font-semibold">{dict.newCycle}</h4>
                  <input type="hidden" name="groupId" value={groupId} />
                  <input type="hidden" name="potId" value={pot.id} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="label">{dict.periodLabel}</label>
                      <input
                        name="periodLabel"
                        className="input"
                        required
                        maxLength={40}
                        defaultValue={suggestedLabel}
                      />
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
                  <details>
                    <summary className="cursor-pointer text-sm text-teal-700">
                      {dict.customAmounts}
                    </summary>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {potPayers.map((m) => (
                        <label key={m.id} className="text-sm">
                          <span className="label">{m.displayName}</span>
                          <input
                            name={`override_${m.id}`}
                            inputMode="decimal"
                            dir="ltr"
                            className="input py-1.5"
                          />
                        </label>
                      ))}
                    </div>
                  </details>
                  <button className="btn-primary">{dict.openCycle}</button>
                </form>
              )}
            </div>
          </section>
        );
      })}

      {/* Members + token links (admin manages) */}
      <section className="card">
        <h2 className="mb-3 text-lg font-bold">{dict.members}</h2>
        <ul className="mb-4 space-y-2">
          {payerMembers.map((m) => {
            const joined = pm
              .filter((x) => x.groupMemberId === m.id)
              .map((x) => groupPots.find((p) => p.id === x.potId)?.name)
              .filter(Boolean);
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 p-2">
                <span>
                  {m.displayName}
                  {m.phone && <span className="ms-2 text-xs text-stone-400" dir="ltr">{m.phone}</span>}
                  {multiPot && joined.length > 0 && (
                    <span className="ms-2 text-xs text-stone-400">
                      {dict.joinsPots}: {joined.join("، ")}
                    </span>
                  )}
                </span>
                {isAdmin && (
                  <span className="flex flex-wrap gap-2">
                    <CopyLink path={`/m/${m.accessToken}`} label={dict.copyLink} copiedLabel={dict.copied} />
                    <WaButton
                      phone={m.phone}
                      template={`${dict.waMemberLinkMsg} "${group.name}": {link}`}
                      path={`/m/${m.accessToken}`}
                      label={dict.shareLink}
                    />
                    <form action={rotateMemberToken} title={dict.rotateLinkHint}>
                      <input type="hidden" name="groupId" value={groupId} />
                      <input type="hidden" name="memberId" value={m.id} />
                      <button className="btn-secondary text-xs">{dict.rotateLink}</button>
                    </form>
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {isAdmin && (
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
            {multiPot && (
              <div>
                <span className="label">{dict.joinsPots}</span>
                <div className="flex flex-wrap gap-3">
                  {groupPots.map((p) => (
                    <label key={p.id} className="flex items-center gap-1 text-sm">
                      <input type="checkbox" name="potIds" value={p.id} defaultChecked />
                      {p.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <button className="btn-primary">{dict.addMember}</button>
          </form>
        )}
      </section>

      {/* Multi-pot: hidden until needed (brief §3). Admin only. */}
      {isAdmin && members.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-semibold text-teal-700">
            {dict.addPot}
          </summary>
          <form action={createPot} className="mt-3 space-y-3">
            <input type="hidden" name="groupId" value={groupId} />
            <div>
              <label className="label">{dict.potName}</label>
              <input name="name" className="input" required maxLength={80} />
            </div>
            <div>
              <label className="label">{dict.potCollector}</label>
              <select name="collectorMemberId" className="input">
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <span className="label">{dict.potMembers}</span>
              <div className="flex flex-wrap gap-3">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-1 text-sm">
                    <input type="checkbox" name="memberIds" value={m.id} defaultChecked />
                    {m.displayName}
                  </label>
                ))}
              </div>
            </div>
            <button className="btn-primary">{dict.createPot}</button>
          </form>
        </details>
      )}
    </div>
  );
}
