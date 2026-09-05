// Pricing gate (brief §10): build the check, don't enable it.
// Free tier limits gate CREATION and later export/search depth — never
// visibility of an existing record. BILLING_ENABLED=1 turns the gate on;
// default off = unlimited (billing is out of v1 scope).

export const FREE_LIMITS = {
  activeGroups: 2,
};

export function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED === "1";
}

export function canCreateGroup(activeGroupCount: number): boolean {
  if (!billingEnabled()) return true;
  // Paid-plan lookup lands here when billing ships; everyone is free-tier now.
  return activeGroupCount < FREE_LIMITS.activeGroups;
}
