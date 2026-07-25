export const ADMIN_EXEMPT_BILLING_MODE = "ADMIN_EXEMPT";

export function isAdminExemptTask(input: Record<string, unknown> | null | undefined) {
  return input?.billingMode === ADMIN_EXEMPT_BILLING_MODE;
}
