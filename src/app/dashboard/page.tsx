import { and, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { groups, groupMembers, pots } from "@/db/schema";
import { getLocale, t } from "@/lib/i18n";
import { getSession } from "@/lib/session";
import { createGroup } from "./actions";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const dict = t(await getLocale());
  const d = db();
  const { limit } = await searchParams;

  const adminGroups = await d
    .select()
    .from(groups)
    .where(and(eq(groups.adminUserId, session.uid), isNull(groups.archivedAt)))
    .orderBy(desc(groups.createdAt));

  // Groups reached as a pot collector (trips: Sara collects the car pot in
  // a group Ali admins). Linked at login via group_members.user_id.
  const collectorRows = await d
    .selectDistinct({ group: groups })
    .from(pots)
    .innerJoin(groupMembers, eq(pots.collectorMemberId, groupMembers.id))
    .innerJoin(groups, eq(pots.groupId, groups.id))
    .where(
      and(
        eq(groupMembers.userId, session.uid),
        isNull(pots.archivedAt),
        isNull(groups.archivedAt),
      ),
    );
  const adminIds = new Set(adminGroups.map((g) => g.id));
  const collectorGroups = collectorRows
    .map((r) => r.group)
    .filter((g) => !adminIds.has(g.id));

  const templates = ["building", "apartment", "family", "trip", "custom"] as const;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="mb-3 text-xl font-bold">{dict.dashboard}</h1>
        {limit === "1" && (
          <p className="card mb-3 border-amber-300 bg-amber-50 text-sm text-amber-800">
            {dict.freeLimitReached}
          </p>
        )}
        {adminGroups.length + collectorGroups.length === 0 ? (
          <p className="card text-sm text-stone-500">{dict.noGroups}</p>
        ) : (
          <ul className="space-y-2">
            {adminGroups.map((g) => (
              <li key={g.id}>
                <a href={`/g/${g.id}`} className="card flex items-center justify-between hover:border-teal-600">
                  <span className="font-semibold">{g.name}</span>
                  <span className="text-sm text-stone-500">{dict[g.type]}</span>
                </a>
              </li>
            ))}
            {collectorGroups.map((g) => (
              <li key={g.id}>
                <a href={`/g/${g.id}`} className="card flex items-center justify-between hover:border-teal-600">
                  <span className="font-semibold">{g.name}</span>
                  <span className="badge bg-teal-100 text-teal-800">{dict.collector}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-bold">{dict.newGroup}</h2>
        <form action={createGroup} className="space-y-3">
          <div>
            <label className="label" htmlFor="name">{dict.groupName}</label>
            <input id="name" name="name" className="input" required maxLength={80} />
          </div>
          <div>
            <label className="label" htmlFor="yourName">{dict.yourName}</label>
            <input id="yourName" name="yourName" className="input" required maxLength={80} />
          </div>
          <div>
            <span className="label">{dict.template}</span>
            <div className="flex flex-wrap gap-2">
              {templates.map((tp, i) => (
                <label key={tp} className="cursor-pointer">
                  <input type="radio" name="type" value={tp} defaultChecked={i === 0} className="peer sr-only" />
                  <span className="badge border border-stone-300 bg-white px-3 py-1.5 text-sm peer-checked:border-teal-700 peer-checked:bg-teal-700 peer-checked:text-white">
                    {dict[tp]}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <button className="btn-primary w-full">{dict.create}</button>
        </form>
      </section>
    </div>
  );
}
