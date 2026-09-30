# Creator DM Agent

AI agent that replies to Instagram DMs and keyword comments in a creator's voice, answers from the campaign brief, sends tracked links, and hands off to a human when it should. Jev (TypeSafe) makes the judgment calls; Claude writes the replies. The pilot runs on ManyChat, so no Meta app or App Review is needed.

## Run it locally

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY at minimum
npm run dev                  # open http://localhost:3000/simulator
```

To test Jev by itself (no Anthropic key needed), put `TYPESAFE_API_KEY` in `.env.local` and run `npm run jev:test`. It scores 10 follower messages and 6 drafts and shows where the policy disagrees with what we expect.

The simulator needs only `ANTHROPIC_API_KEY`. Add `TYPESAFE_API_KEY` to use Jev. Without it, the LLM fallback runs and replies show as held.

## Deploy (Vercel)

1. Import this repo in Vercel.
2. Set every variable from `.env.example` (`ADMIN_PASSWORD` is required in production).
3. In Supabase, run `supabase/schema.sql` in the SQL editor.

## Add a campaign and a creator (Supabase SQL editor)

```sql
insert into campaigns (id, brief) values ('shopify-ai-store', '<paste the brief JSON from the simulator>');

insert into creators (handle, inbound_secret, manychat_api_key, voice, campaign_ids)
values (
  'creatorhandle',
  replace(gen_random_uuid()::text, '-', ''),   -- becomes part of their webhook URL
  '<their ManyChat API key>',
  '{"handle":"creatorhandle","notes":"...","samples":["...","..."]}',
  '{shopify-ai-store}'
)
returning inbound_secret;
```

New creators start with `approval_mode = true`: drafts wait in `/approvals` until you flip it off.

## Connect a creator's ManyChat (one time, about 10 minutes)

1. The creator connects Instagram to a paid ManyChat account (Essential or higher; SideShift can own the account). Make sure the API key is available: Settings → API.
2. Create two tags: `dm-agent-handoff` and `dm-agent-crisis`.
3. Build one flow, **DM Agent**:
   - Triggers: **Instagram Default Reply** (any DM) and a **Post/Reel comment** trigger on the campaign keyword (e.g. `STORE`) for the campaign posts.
   - Action: **Dynamic Block** → POST `https://<your-app>/api/manychat/<inbound_secret>` with this JSON body:
     ```json
     { "subscriber_id": "{{Contact Id}}", "username": "{{Instagram Username}}", "message": "{{Last Text Input}}", "source": "dm" }
     ```
     (Use `"source": "comment"` and the comment-text field in the comment trigger's copy of the flow.)
4. In Live Chat settings, turn on pausing automation when a person replies, so creators can take over any thread.
5. DM the creator's account from a test account and watch the reply, the trace in Supabase `messages`, and `/approvals`.

## Layout

| Path | What it is |
|---|---|
| `src/lib/agent.ts` | The turn pipeline every channel calls |
| `src/lib/jev.ts` | Jev inbound + outbound checks |
| `src/lib/writer.ts` | Claude reply writer (no templates) |
| `src/lib/policy.ts` | Every threshold and routing rule |
| `src/lib/fallback.ts` | LLM version of the Jev checks |
| `src/lib/manychat.ts` | ManyChat send + tag API |
| `src/app/api/manychat/[secret]` | ManyChat inbound endpoint |
| `src/app/simulator` | Test harness with step-by-step trace |
| `src/app/approvals` | Held-draft queue |
| `src/app/l/[slug]` | Tracked link redirect |
| `supabase/schema.sql` | Database |
