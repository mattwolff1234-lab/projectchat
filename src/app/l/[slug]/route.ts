import { resolveLink } from "@/lib/db";

// Tracked link redirect: logs the click, then sends the follower to the brand.
export async function GET(req: Request, ctx: RouteContext<"/l/[slug]">) {
  const { slug } = await ctx.params;
  const destination = await resolveLink(slug, {
    user_agent: req.headers.get("user-agent") ?? undefined,
    referrer: req.headers.get("referer") ?? undefined,
  }).catch(() => null);
  if (!destination) return new Response("Link not found", { status: 404 });
  return Response.redirect(destination, 302);
}
