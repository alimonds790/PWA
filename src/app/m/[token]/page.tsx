import { and, desc, eq, inArray, isNull } from "drizzle-orm";
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
import { fmt, sum } from "@/lib/money";
import { waLink } from "@/lib/wa";
import { submitClaim } from "./actions";

export const dynamic = "force-dynamic";

const statusLabel = (dict: Dict, s: string) =>
  s === "confirmed"
    ? dict.statusConfirmed
    : s === "claimed"
      ? dict.statusClaimed
      : s === "rejected"
        ? dict.statusRejected
        : dict.statusPending;

export default async function MemberPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const locale = await getLocale();
  const dict = t(locale);
  const d = db();

  const [member] = await d
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.accessToken, token), isNull(groupMembers.archivedAt)));
  if (!member) {
    return <p className="card text-center text-stone-500">{dict.notFound}</p>;
  }

  const [group] = await d.select().from(groups).where(eq(groups.id, member.groupId));
  const groupPots = await d
    .select()
    .from(pots)
    .where(and(eq(pots.groupId, member.groupId), isNull(pots.archivedAt)));
  const potById = new Map(groupPots.map((p) => [p.id, p]));

  const collectorIds = groupPots.map((p) => p.collectorMemberId);
  const collectors = collectorIds.length
    ? await d.select().from(groupMembers).where(inArray(groupMembers.id, collectorIds))
    : [];
  const collectorById = new Map(collectors.map((c) => [c.id, c]));

  const obs = await d
    .select({ ob: obligations, cycle: cycles })
    .from(obligations)
    .innerJoin(cycles, eq(obligations.cycleId, cycles.id))
    .where(eq(obligations.groupMemberId, member.id))
    .orderBy(desc(cycles.openedAt));

  const obIds = obs.map((o) => o.ob.id);
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

  const outstanding = obs
    .filter((o) => o.ob.status !== "confirmed")
    .map((o) => o.ob.amountDue);

  const methodLabel = (m: string) =>
    dict[m as "instapay" | "wallet" | "cash" | "bank" | "other"] ?? m;
  const dt = (x: Date) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(x);

  return (
    <div className="space-y-6">
      <div className="card text-center">
        <p className="text-sm text-stone-500">{group?.name}</p>
        <h1 className="text-xl font-bold">{member.displayName}</h1>
        <p className="mt-2 text-sm">
          {dict.yourObligations}:{" "}
          <b className={outstanding.length ? "text-red-700" : "text-green-700"}>
            {fmt(sum(outstanding), locale)}
          </b>
        </p>
      </div>

      {obs.map(({ ob, cycle }) => {
        const pot = potById.get(cycle.potId);
        const collector = pot ? collectorById.get(pot.collectorMemberId) : undefined;
        const obClaims = claims.filter((c) => c.obligationId === ob.id);
        const latestClaim = obClaims[0];
        const canClaim = ob.status === "pending" || ob.status === "rejected";

        const proofText =
          latestClaim &&
          `${dict.waProofPrefix}: ${group?.name} · ${cycle.periodLabel} · ${fmt(latestClaim.amount, locale)} · ${methodLabel(latestClaim.method)}${latestClaim.referenceNumber ? ` · #${latestClaim.referenceNumber}` : ""} · ${latestClaim.paidDate} — ${member.displayName}`;

        return (
          <section key={ob.id} className="card">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold">
                {cycle.periodLabel}
                <span className="ms-2 text-sm font-normal text-stone-500">
                  {fmt(ob.amountDue, locale)}
                </span>
              </p>
              <span className={`badge-${ob.status}`}>{statusLabel(dict, ob.status)}</span>
            </div>
            {cycle.dueDate && (
              <p className="mb-2 text-xs text-stone-500">
                {dict.dueDate}: {cycle.dueDate}
              </p>
            )}

            {/* Timeline: append-only record, always fully visible */}
            {obClaims.length > 0 && (
              <div className="mb-3 rounded-lg bg-stone-50 p-3">
                <p className="mb-1 text-xs font-semibold text-stone-500">{dict.timeline}</p>
                <ul className="space-y-1 text-xs text-stone-700">
                  {obClaims
                    .slice()
                    .reverse()
                    .flatMap((c) => [
                      <li key={`c${c.id}`}>
                        {dict.claimedAt} {dt(c.claimedAt)} · {fmt(c.amount, locale)} ·{" "}
                        {methodLabel(c.method)}
                        {c.referenceNumber && <span dir="ltr"> · #{c.referenceNumber}</span>}
                        {c.note && ` · ${c.note}`}
                      </li>,
                      ...confs
                        .filter((cf) => cf.paymentClaimId === c.id)
                        .slice()
                        .reverse()
                        .map((cf) => (
                          <li
                            key={`f${cf.id}`}
                            className={cf.status === "confirmed" ? "text-green-700" : "text-red-700"}
                          >
                            {cf.status === "confirmed" ? dict.confirmedAt : dict.rejectedAt}{" "}
                            {dt(cf.actedAt)}
                            {cf.note && ` · ${cf.note}`}
                          </li>
                        )),
                    ])}
                </ul>
              </div>
            )}

            {/* Proof via member's own WhatsApp — nothing is uploaded here */}
            {ob.status === "claimed" && latestClaim && collector && (
              <a
                href={waLink(collector.phone, proofText!)}
                target="_blank"
                className="btn-whatsapp w-full"
              >
                {dict.sendProof} ({collector.displayName})
              </a>
            )}

            {canClaim && (
              <form action={submitClaim} className="space-y-3 border-t border-stone-200 pt-3">
                <h3 className="font-semibold">{dict.iPaid}</h3>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="obligationId" value={ob.id} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">{dict.amount}</label>
                    <input
                      name="amount"
                      inputMode="decimal"
                      dir="ltr"
                      defaultValue={ob.amountDue}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">{dict.paidDate}</label>
                    <input
                      name="paidDate"
                      type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      className="input"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="label">{dict.method}</label>
                  <select name="method" className="input">
                    <option value="instapay">{dict.instapay}</option>
                    <option value="wallet">{dict.wallet}</option>
                    <option value="cash">{dict.cash}</option>
                    <option value="bank">{dict.bank}</option>
                    <option value="other">{dict.other}</option>
                  </select>
                </div>
                <div>
                  <label className="label">{dict.reference}</label>
                  <input name="referenceNumber" dir="ltr" className="input" maxLength={60} />
                </div>
                <div>
                  <label className="label">{dict.optionalNote}</label>
                  <input name="note" className="input" maxLength={200} />
                </div>
                <button className="btn-primary w-full">{dict.submitClaim}</button>
              </form>
            )}
          </section>
        );
      })}
    </div>
  );
}
