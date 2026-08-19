import {
  pgTable,
  pgEnum,
  bigserial,
  bigint,
  text,
  timestamp,
  numeric,
  date,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── enums ────────────────────────────────────────────────────────────────
export const groupType = pgEnum("group_type", [
  "building",
  "apartment",
  "family",
  "trip",
  "custom",
]);
export const splitType = pgEnum("split_type", ["equal", "custom", "per_unit"]);
export const recurrence = pgEnum("recurrence", ["none", "monthly"]);
export const obligationStatus = pgEnum("obligation_status", [
  "pending",
  "claimed",
  "confirmed",
  "rejected",
]);
export const paymentMethod = pgEnum("payment_method", [
  "instapay",
  "wallet",
  "cash",
  "bank",
  "other",
]);
export const confirmationStatus = pgEnum("confirmation_status", [
  "confirmed",
  "rejected",
]);

// ── collectors/admins only; members never get rows here unless they
//    later register (group_members.user_id) ─────────────────────────────
export const users = pgTable(
  "users",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    phone: text("phone").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_phone_uq").on(t.phone)],
);

export const groups = pgTable("groups", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  type: groupType("type").notNull().default("custom"),
  adminUserId: bigint("admin_user_id", { mode: "number" })
    .notNull()
    .references(() => users.id),
  currency: text("currency").notNull().default("EGP"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

// Archive, never delete (archived_at). Identity fields nullable on purpose:
// phone optional, user_id set only if the member later registers.
export const groupMembers = pgTable(
  "group_members",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    groupId: bigint("group_id", { mode: "number" })
      .notNull()
      .references(() => groups.id),
    displayName: text("display_name").notNull(),
    phone: text("phone"),
    accessToken: text("access_token").notNull(),
    userId: bigint("user_id", { mode: "number" }).references(() => users.id),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("group_members_token_uq").on(t.accessToken),
    index("group_members_group_idx").on(t.groupId),
  ],
);

// Exactly one collector per pot (invariant #8).
export const pots = pgTable(
  "pots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    groupId: bigint("group_id", { mode: "number" })
      .notNull()
      .references(() => groups.id),
    name: text("name").notNull(),
    collectorMemberId: bigint("collector_member_id", { mode: "number" })
      .notNull()
      .references(() => groupMembers.id),
    splitType: splitType("split_type").notNull().default("equal"),
    recurrence: recurrence("recurrence").notNull().default("none"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("pots_group_idx").on(t.groupId)],
);

// Pot membership is a SUBSET of group membership.
export const potMembers = pgTable(
  "pot_members",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    potId: bigint("pot_id", { mode: "number" })
      .notNull()
      .references(() => pots.id),
    groupMemberId: bigint("group_member_id", { mode: "number" })
      .notNull()
      .references(() => groupMembers.id),
    shareAmount: numeric("share_amount", { precision: 12, scale: 2 }),
    shareUnits: numeric("share_units", { precision: 12, scale: 2 }),
  },
  (t) => [uniqueIndex("pot_members_uq").on(t.potId, t.groupMemberId)],
);

export const cycles = pgTable(
  "cycles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    potId: bigint("pot_id", { mode: "number" })
      .notNull()
      .references(() => pots.id),
    periodLabel: text("period_label").notNull(), // e.g. '2026-03' or 'Chalet'
    dueDate: date("due_date"),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("cycles_pot_idx").on(t.potId)],
);

// status here is DERIVED convenience state and may be recomputed;
// the immutable record is payment_claims + confirmations.
export const obligations = pgTable(
  "obligations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    cycleId: bigint("cycle_id", { mode: "number" })
      .notNull()
      .references(() => cycles.id),
    groupMemberId: bigint("group_member_id", { mode: "number" })
      .notNull()
      .references(() => groupMembers.id),
    amountDue: numeric("amount_due", { precision: 12, scale: 2 }).notNull(),
    status: obligationStatus("status").notNull().default("pending"),
  },
  (t) => [
    index("obligations_cycle_idx").on(t.cycleId),
    index("obligations_member_idx").on(t.groupMemberId),
  ],
);

// APPEND ONLY — never UPDATE or DELETE (invariant #7).
export const paymentClaims = pgTable(
  "payment_claims",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    obligationId: bigint("obligation_id", { mode: "number" })
      .notNull()
      .references(() => obligations.id),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paidDate: date("paid_date").notNull(),
    method: paymentMethod("method").notNull(),
    referenceNumber: text("reference_number"),
    note: text("note"),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("payment_claims_obligation_idx").on(t.obligationId)],
);

// APPEND ONLY — a correction is a new row; latest row wins for derived status.
export const confirmations = pgTable(
  "confirmations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    paymentClaimId: bigint("payment_claim_id", { mode: "number" })
      .notNull()
      .references(() => paymentClaims.id),
    actorMemberId: bigint("actor_member_id", { mode: "number" })
      .notNull()
      .references(() => groupMembers.id),
    status: confirmationStatus("status").notNull(),
    note: text("note"),
    actedAt: timestamp("acted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("confirmations_claim_idx").on(t.paymentClaimId)],
);

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: bigint("entity_id", { mode: "number" }).notNull(),
  action: text("action").notNull(),
  actorId: text("actor_id"), // 'user:<id>' | 'member:<id>' | 'system'
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Versioned consent — built now even though the consent UX ships later
// (see COMPLIANCE.md §B3). Adding payments later = change of purpose =
// fresh consent per subject; version history makes that migration sane.
export const consents = pgTable("consents", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  subjectType: text("subject_type").notNull(), // 'user' | 'group_member'
  subjectId: bigint("subject_id", { mode: "number" }).notNull(),
  policyVersion: text("policy_version").notNull(),
  purposes: jsonb("purposes").notNull(), // string[]
  grantedAt: timestamp("granted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
});
