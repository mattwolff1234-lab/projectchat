@AGENTS.md

# Creator DM Agent

An AI agent that answers Instagram DMs and keyword comments for SideShift creators running brand campaigns. It talks in the creator's voice, answers questions from the campaign brief, sends a tracked link, and hands off to a human when it should. First campaign: Shopify (launch a store with Claude or ChatGPT).

Spec: https://claude.ai/code/artifact/cb2d3a87-a4a0-492c-bc30-ea8605220d1e
Voice guide (Shopify): https://claude.ai/code/artifact/e2699baa-8cf6-4ec7-ac2b-c867e343067c

## How a turn works

`src/lib/agent.ts` `runTurn()` is the whole brain, and every channel calls it:

1. **Inbound check** (`src/lib/jev.ts`): one Jev request asks, in parallel, whether the message is about a campaign, which one, the follower's intent, whether a human is needed, and whether there's distress.
2. **Inbound policy** (`src/lib/policy.ts`): code decides silent / handoff / crisis / write. All thresholds live in `T`.
3. **Write** (`src/lib/writer.ts`): Claude writes the reply from scratch, with no templates. It inserts `[[LINK]]` where the link goes, and code swaps in a tracked link.
4. **Outbound check** (`src/lib/jev.ts`): Jev checks the draft for money claims, claims not in the brief, speaking as the brand, banned phrases, and voice match.
5. **Outbound policy**: block → one rewrite with the reason → handoff if blocked again. Borderline → held for approval.

Jev only judges and never writes. If `TYPESAFE_API_KEY` is missing or Jev fails, `src/lib/fallback.ts` asks the LLM the same questions and the reply is held for approval.

## Channels

- **ManyChat (pilot)**: `src/app/api/manychat/[secret]/route.ts`. ManyChat owns the Meta-approved Instagram connection. The creator's flow calls our URL from a Dynamic Block. We answer inside ManyChat's hard 10s limit (8s budget). If we're slower, we return an empty block and send through the ManyChat API in `after()`. Handoffs add the tag `dm-agent-handoff` (or `dm-agent-crisis`) so they show in ManyChat Live Chat.
- **Direct Meta app (later)**: not built. It needs our own Meta app + App Review (see spec). It should be a new route that calls `runTurn()` the same way.

## Other pieces

- `/simulator`: test any brief + voice against the real pipeline, with a per-step trace. The fastest way to tune prompts and thresholds.
- `/approvals`: queue of held drafts; edit, send, or discard.
- `/l/[slug]`: tracked link redirect; logs clicks.
- `supabase/schema.sql`: tables + `campaign_stats` view.
- `src/lib/seed.ts`: Shopify brief built from the Notion creator brief and Money Playbook.

## Commands

- `npm run dev`: local app (simulator works with just `ANTHROPIC_API_KEY`)
- `npm test`: pipeline + policy tests with mocked models (vitest)
- `npm run build`: production build

## Rules that matter

- The agent never promises income. That's enforced in three places: writer prompt, outbound check, policy. Don't remove any of them.
- No canned replies. If something needs to always be said (e.g. disclosure when asked), put it in the brief, not a template.
- Keep API keys server-side. ManyChat API keys are stored per creator in `creators.manychat_api_key`.
- Instagram's 24h window applies through ManyChat too. Approvals older than 24h since the follower's last message will fail to send.
- Unofficial Instagram automation (private API, logging in as the creator) is off the table. It gets accounts banned.

## Known gaps / next up

- Creator manual replies don't pause the bot yet. For now, use ManyChat's Live Chat "pause automation" setting, and look into detecting creator replies via ManyChat.
- Crisis notifications to the campaign manager (Slack) are a TODO in the ManyChat route.
- No per-conversation turn cap yet (spec says cap agent turns).
- Voice profiles are hand-entered. Next: auto-build from a creator's recent captions.
- Measure real latency against the 8s budget and the per-conversation model cost during the pilot.
