import { json, route } from "@/lib/http";
import { getDashboardData } from "@/lib/dashboard";

export const GET = route({}, async ({ userId }) => json(await getDashboardData(userId)));
