-- Creator DM Agent schema (Supabase / Postgres). Run once in the SQL editor.

create table campaigns (
  id text primary key,                 -- e.g. 'shopify-ai-store'
  brief jsonb not null,                -- CampaignBrief (see src/lib/types.ts)
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table creators (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique,         -- IG handle, no @
  inbound_secret text not null unique, -- goes in the ManyChat request URL to identify the creator
  manychat_api_key text,               -- creator's (or SideShift-owned) ManyChat API key
  voice jsonb not null,                -- VoiceProfile
  campaign_ids text[] not null default '{}',
  bot_enabled boolean not null default true,
  approval_mode boolean not null default true,  -- new creators start in approval mode
  created_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id),
  follower_key text not null,          -- ManyChat subscriber id (or IGSID later)
  follower_username text,
  campaign_id text references campaigns(id),
  status text not null default 'active', -- active | paused | handed_off | closed
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  unique (creator_id, follower_key)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id),
  sender text not null,                -- follower | agent | creator
  text text not null,
  action text,                         -- for agent turns: reply | needs_approval | handoff | silent | crisis
  reason text,
  trace jsonb,                         -- full decision trace (Jev judgments, drafts, policy)
  status text not null default 'sent', -- sent | pending_approval | rejected
  created_at timestamptz not null default now()
);
create index on messages (conversation_id, created_at);
create index on messages (status) where status = 'pending_approval';

create table links (
  slug text primary key,
  creator_id uuid not null references creators(id),
  campaign_id text not null references campaigns(id),
  conversation_id uuid references conversations(id),
  destination text not null,
  created_at timestamptz not null default now()
);

create table clicks (
  id bigserial primary key,
  slug text not null references links(slug),
  clicked_at timestamptz not null default now(),
  user_agent text,
  referrer text
);
create index on clicks (slug);

-- Campaign reporting: conversations, handoffs, and clicks per creator x campaign.
create view campaign_stats as
select
  c.campaign_id,
  cr.handle,
  count(distinct c.id) as conversations,
  count(distinct c.id) filter (where c.status = 'handed_off') as handoffs,
  count(k.id) as clicks
from conversations c
join creators cr on cr.id = c.creator_id
left join links l on l.conversation_id = c.id
left join clicks k on k.slug = l.slug
group by c.campaign_id, cr.handle;

-- Service-role access only; nothing here is exposed to the browser.
alter table campaigns enable row level security;
alter table creators enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table links enable row level security;
alter table clicks enable row level security;
