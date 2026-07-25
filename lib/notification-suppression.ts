function configuredSuppressedRecipients() {
  return new Set(
    [process.env.ACCEPTANCE_ADMIN_EMAIL, process.env.ACCEPTANCE_USER_EMAIL, process.env.NOTIFICATION_SUPPRESSED_RECIPIENTS]
      .flatMap((value) => (value || "").split(","))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isNotificationRecipientSuppressed(recipient: string) {
  return configuredSuppressedRecipients().has(recipient.trim().toLowerCase());
}
