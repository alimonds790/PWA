CREATE TYPE "public"."confirmation_status" AS ENUM('confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."group_type" AS ENUM('building', 'apartment', 'family', 'trip', 'custom');--> statement-breakpoint
CREATE TYPE "public"."obligation_status" AS ENUM('pending', 'claimed', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('instapay', 'wallet', 'cash', 'bank', 'other');--> statement-breakpoint
CREATE TYPE "public"."recurrence" AS ENUM('none', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."split_type" AS ENUM('equal', 'custom', 'per_unit');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" bigint NOT NULL,
	"action" text NOT NULL,
	"actor_id" text,
	"before_json" jsonb,
	"after_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "confirmations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"payment_claim_id" bigint NOT NULL,
	"actor_member_id" bigint NOT NULL,
	"status" "confirmation_status" NOT NULL,
	"note" text,
	"acted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" bigint NOT NULL,
	"policy_version" text NOT NULL,
	"purposes" jsonb NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"pot_id" bigint NOT NULL,
	"period_label" text NOT NULL,
	"due_date" date,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"group_id" bigint NOT NULL,
	"display_name" text NOT NULL,
	"phone" text,
	"access_token" text NOT NULL,
	"user_id" bigint,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "group_type" DEFAULT 'custom' NOT NULL,
	"admin_user_id" bigint NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"cycle_id" bigint NOT NULL,
	"group_member_id" bigint NOT NULL,
	"amount_due" numeric(12, 2) NOT NULL,
	"status" "obligation_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_claims" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"obligation_id" bigint NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_date" date NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference_number" text,
	"note" text,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pot_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"pot_id" bigint NOT NULL,
	"group_member_id" bigint NOT NULL,
	"share_amount" numeric(12, 2),
	"share_units" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "pots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"group_id" bigint NOT NULL,
	"name" text NOT NULL,
	"collector_member_id" bigint NOT NULL,
	"split_type" "split_type" DEFAULT 'equal' NOT NULL,
	"recurrence" "recurrence" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_payment_claim_id_payment_claims_id_fk" FOREIGN KEY ("payment_claim_id") REFERENCES "public"."payment_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_actor_member_id_group_members_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_pot_id_pots_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_group_member_id_group_members_id_fk" FOREIGN KEY ("group_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pot_members" ADD CONSTRAINT "pot_members_pot_id_pots_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pot_members" ADD CONSTRAINT "pot_members_group_member_id_group_members_id_fk" FOREIGN KEY ("group_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pots" ADD CONSTRAINT "pots_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pots" ADD CONSTRAINT "pots_collector_member_id_group_members_id_fk" FOREIGN KEY ("collector_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "confirmations_claim_idx" ON "confirmations" USING btree ("payment_claim_id");--> statement-breakpoint
CREATE INDEX "cycles_pot_idx" ON "cycles" USING btree ("pot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_token_uq" ON "group_members" USING btree ("access_token");--> statement-breakpoint
CREATE INDEX "group_members_group_idx" ON "group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "obligations_cycle_idx" ON "obligations" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "obligations_member_idx" ON "obligations" USING btree ("group_member_id");--> statement-breakpoint
CREATE INDEX "payment_claims_obligation_idx" ON "payment_claims" USING btree ("obligation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pot_members_uq" ON "pot_members" USING btree ("pot_id","group_member_id");--> statement-breakpoint
CREATE INDEX "pots_group_idx" ON "pots" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone");