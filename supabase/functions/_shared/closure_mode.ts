export async function closureModeIsEnabled(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<boolean> {
  const baseUrl = supabaseUrl.replace(/\/+$/, "");
  const response = await fetch(
    `${baseUrl}/rest/v1/settings?select=value&key=eq.closure_mode`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );

  if (!response.ok) {
    console.error("CRM Closure Mode status check failed:", response.status);
    return true;
  }

  const settings = await response.json() as { value: string | null }[];
  return settings.some((setting) => setting.value === "true");
}

export async function closureModeAllowsRequest(
  supabaseUrl: string,
  serviceRoleKey: string,
  _authorizationHeader?: string,
): Promise<boolean> {
  return !(await closureModeIsEnabled(supabaseUrl, serviceRoleKey));
}

export function closureModeResponse(): Response {
  return new Response(JSON.stringify({ error: "CRM Closure Mode is enabled.", closed: true }), {
    status: 423,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Cron-Secret",
      "Content-Type": "application/json",
    },
  });
}
