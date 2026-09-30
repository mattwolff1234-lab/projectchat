import type { CampaignBrief, VoiceProfile } from "./types";

// Starting brief, built from the Shopify Creator Brief, Product Deep Dive, and
// Money Content Playbook v2 in Notion. Edit it in the simulator or the DB.
export const SHOPIFY_BRIEF: CampaignBrief = {
  id: "shopify-ai-store",
  name: "Shopify: launch a store with Claude or ChatGPT",
  brand: "Shopify",
  keyword: "STORE",
  link: "https://www.shopify.com/build-with-ai",
  product:
    "Shopify is a commerce platform for starting, running, and growing a business. With the Shopify connector in Claude or the Shopify app in ChatGPT, you can describe what you want to sell and build a real store from chat, then keep running it (products, discounts, orders, analytics) from prompts.",
  facts: [
    "Shopify is a full commerce platform (checkout, payments, inventory, orders, customers, discounts, analytics), not just a website builder.",
    "You can create a Shopify store from chat using Claude or ChatGPT.",
    "In ChatGPT it's called a plugin/app: install the Shopify app, then use @Shopify in the prompt.",
    "In Claude it's called a connector: install the Shopify connector, keep it toggled on, and say 'Shopify' in the prompt.",
    "Always mention Shopify by name in the prompt so the assistant uses it.",
    "After the store is created you can manage it from chat: add products, create discounts, check orders and analytics.",
    "The AI tools speed up setup and day-to-day running; they don't replace Shopify.",
    "Shopify has a $1/month starter offer that may apply when creating a new store (check at signup).",
    "Shopify Collective lets you sell products from other brands without buying inventory first.",
    "You can sell digital products like PDFs, guides, and courses.",
  ],
  talkingPoints: [
    "You can go from a blank chat to a live storefront in minutes.",
    "If you tried Shopify before and gave up, it's easier now: same Shopify, new AI on-ramp.",
    "No products yet? Look at Shopify Collective or digital products.",
    "Lead with the skill (launching a store), never a money promise.",
  ],
  banned: [
    "any income amount or promise (you'll make $X, this store made $X)",
    "easiest / anyone can / passive / from your couch / overnight",
    "get rich, money hack, cash flip, quit your 9-5, guaranteed",
    "speaking as Shopify (we at Shopify, our team)",
    "censored words like m0ney or j*b",
    "political topics",
  ],
  disclosure: "Yes, I'm a Shopify partner. Say it plainly and naturally.",
};

export const SAMPLE_VOICE: VoiceProfile = {
  handle: "samplecreator",
  notes: "all lowercase, casual, short lines, says 'lowkey' and 'fr', uses 😭 and 🙏 occasionally, never uses hashtags in DMs",
  samples: [
    "ok this setup lowkey took me less time than picking a font 😭",
    "not me building a whole store in claude at 2am",
    "yall asked so here's the exact prompt i used 🙏",
    "fr the hardest part was picking a name lol",
    "comment STORE and i'll send you the walkthrough",
  ],
};
