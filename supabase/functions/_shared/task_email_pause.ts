export async function taskEmailsArePaused(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<boolean> {
  const baseUrl = supabaseUrl.replace(/\/+$/, "");
  const response = await fetch(
    `${baseUrl}/rest/v1/settings?select=value&key=eq.task_email_paused`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );

  if (!response.ok) {
    console.error("Task email pause check failed:", response.status);
    return true;
  }

  const settings = await response.json() as { value: string | null }[];
  return settings.some((setting) => setting.value === "true");
}

export function isTaskNotificationType(notificationType: string): boolean {
  return [
    "task_created",
    "task_assigned",
    "task_assignment",
    "pending_tasks",
    "task_reminder",
    "task_owner_reminder",
    "inactivity",
  ].includes(notificationType);
}
