import { isAdmin } from "@/lib/auth";
import { listPendingApprovals } from "@/lib/db";

export async function GET(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await listPendingApprovals());
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
