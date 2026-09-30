import { runTurn } from "@/lib/agent";
import { isAdmin } from "@/lib/auth";
import type { CampaignBrief, Turn, VoiceProfile } from "@/lib/types";

export const maxDuration = 60;

// Runs the exact live pipeline against a pasted brief + voice, without Instagram.
export async function POST(req: Request) {
  if (!isAdmin(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as {
    message: string;
    thread: Turn[];
    brief: CampaignBrief;
    voice: VoiceProfile;
    approvalMode?: boolean;
  };
  try {
    const result = await runTurn({
      message: body.message,
      thread: body.thread ?? [],
      campaigns: [body.brief],
      voice: body.voice,
      approvalMode: Boolean(body.approvalMode),
      makeLink: async (c) => `${c.link}${c.link.includes("?") ? "&" : "?"}ref=simulator`,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
