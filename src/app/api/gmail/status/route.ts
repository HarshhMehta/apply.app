import { json, route } from "@/lib/http";
import { getConnectionSummary } from "@/lib/gmail/service";
import { OAUTH_SCOPES } from "@/lib/gmail/oauth";

export const GET = route({}, async ({ userId }) => json({ connection: await getConnectionSummary(userId), requestedScopes: OAUTH_SCOPES }));
