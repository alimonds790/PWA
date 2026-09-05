import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  groupMembers,
  pots,
  cycles,
  obligations,
  paymentClaims,
  confirmations,
} from "@/db/schema";
import { getLocale, t, type Dict } from "@/lib/i18n";
import { getSession } from "@/lib/session";
import { getGroupAccess } from "@/lib/authz";
import { fmt } from "@/lib/money";
import { PrintButton } from "@/app/print-button";

export const dynamic = "force-dynamic";

// The paper trail, on paper: a printable full record per group. The browser's
// "save as PDF" is the export path — no file is generated or stored server-
// side (invariant #1), and free-tier limits never gate an existing record.
export default async function PrintPage({
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
  const { group } = access;

  const members = await d
    .select()
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));
  const memberById = new Map(members.map((m) => [m.id, m]));

  const groupPots = await d
    .select()
    .from(pots)
    .where(and(eq(pots.groupId, groupId), isNull(pots.archivedAt)))
    .orderBy(asc(pots.id));
  const multiPot = groupPots.length > 1;

  const potIds = groupPots.map((p) => p.id);
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
        .orderBy(asc(paymentClaims.claimedAt))
    : [];
  const claimIds = claims.map((c) => c.id);
  const confs = claimIds.length
    ? await d
        .select()
        .from(confirmations)
        .where(inArray(confirmations.paymentClaimId, claimIds))
        .orderBy(asc(confirmations.actedAt))
    : [];

  const methodLabel = (m: string) =>
    dict[m as "instapay" | "wallet" | "cash" | "bank" | "other"] ?? m;
  const statusLabel = (s: string) =>
    (
      ({
        confirmed: dict.statusConfirmed,
        claimed: dict.statusClaimed,
        rejected: dict.statusRejected,
        pending: dict.statusPending,
      }) as Record<string, string>
    )[s] ?? s;
  const dt = (x: Date) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(x);

  return (
    <div className="space-y-5 bg-white p-2 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <a href={`/g/${groupId}`} className="text-sm text-teal-700 underline">
          {dict.back}
        </a>
        <PrintButton label={dict.printRecord} />
      </div>

      <header className="border-b-2 border-stone-800 pb-2">
        <h1 className="text-2xl font-bold">{group.name} — {dict.fullRecord}</h1>
        <p className="text-sm text-stone-600">
          {dict.appName} · {dict.generatedAt}: {dt(new Date())}
        </p>
      </header>

      {groupPots.map((pot) => {
        const potCyclesHere = potCycles.filter((c) => c.potId === pot.id);
        const collector = memberById.get(pot.collectorMemberId);
        return (
          <section key={pot.id} className="space-y-3">
            {multiPot && (
              <h2 className="text-lg font-bold">
                {pot.name}
                <span className="ms-2 text-sm font-normal text-stone-600">
                  ({dict.collector}: {collector?.displayName})
                </span>
              </h2>
            )}
            {potCyclesHere.length === 0 && (
              <p className="text-sm text-stone-500">{dict.noCycles}</p>
            )}
            {potCyclesHere.map((cy) => {
              const cyObs = obs.filter((o) => o.cycleId === cy.id);
              return (
                <div key={cy.id} className="break-inside-avoid rounded border border-stone-300 p-3">
                  <p className="mb-2 font-bold">
                    {cy.periodLabel}
                    {cy.dueDate && (
                      <span className="ms-2 text-xs font-normal">
                        ({dict.dueDate}: {cy.dueDate})
                      </span>
                    )}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-stone-300 text-start text-xs text-stone-600">
                          <th className="py-1 text-start">{dict.name}</th>
                          <th className="py-1 text-start">{dict.amount}</th>
                          <th className="py-1 text-start">{dict.timeline}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cyObs.map((o) => {
                          const oClaims = claims.filter((c) => c.obligationId === o.id);
                          return (
                            <tr key={o.id} className="border-b border-stone-200 align-top">
                              <td className="py-1.5 pe-2 font-medium">
                                {memberById.get(o.groupMemberId)?.displayName}
                                <div className="text-xs font-normal text-stone-500">
                                  {statusLabel(o.status)}
                                </div>
                              </td>
                              <td className="py-1.5 pe-2 whitespace-nowrap">
                                {fmt(o.amountDue, locale)}
                              </td>
                              <td className="py-1.5 text-xs">
                                {oClaims.length === 0 && "—"}
                                {oClaims.map((c) => (
                                  <div key={c.id} className="mb-1">
                                    <div>
                                      {dict.claimedAt} {dt(c.claimedAt)} · {fmt(c.amount, locale)} ·{" "}
                                      {methodLabel(c.method)}
                                      {c.referenceNumber && <span dir="ltr"> · #{c.referenceNumber}</span>}
                                      {" · "}{c.paidDate}
                                      {c.note && ` · ${c.note}`}
                                    </div>
                                    {confs
                                      .filter((cf) => cf.paymentClaimId === c.id)
                                      .map((cf) => (
                                        <div key={cf.id} className="ps-3">
                                          {cf.status === "confirmed" ? dict.confirmedAt : dict.rejectedAt}{" "}
                                          {dt(cf.actedAt)} —{" "}
                                          {memberById.get(cf.actorMemberId)?.displayName}
                                          {cf.note && ` · ${cf.note}`}
                                        </div>
                                      ))}
                                  </div>
                                ))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}

      <p className="border-t border-stone-300 pt-2 text-xs text-stone-500">
        {dict.recordNotArbiter}
      </p>
    </div>
  );
}
