#!/usr/bin/env python3
"""Revised, cheaper enrichment test: scrape websites ourselves (no model tokens),
feed cleaned text into a single one-shot Sonnet 5 call per record -- no agentic
web_fetch/web_search tools. Same 24-record sample as the first comparison test.
"""
import json
import os
import re

import anthropic
import requests
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

MODEL_ID = "claude-sonnet-5"
MAX_CHARS = 6000

SYSTEM_PROMPT = """You are enriching a directory listing for an antique/vintage store, based on a \
scraped Google Maps record plus (when available) cleaned text scraped from the store's real website.

You have NO ability to browse the web or search -- use ONLY the information given to you below.

Produce a single JSON object with exactly these fields:
- primary_specialty: a short, specific description of what this store actually specializes in \
(e.g. "Mid-century modern furniture", "Oddities, taxidermy & curiosities", "General antiques & \
collectibles"). Base this on real evidence, not the generic Google category alone.
- business_model: one of "single_dealer", "multi_vendor_mall", "appointment_only_showroom", or "unknown"
- buys_antiques: true, false, or null if genuinely unclear
- buying_model: one of "buys_outright", "consignment_vendor_booth", "unclear"
- enriched_description: 2-4 sentences of genuine, specific, factual content about this store, \
grounded in the evidence given to you. Never invent facts. If you have almost nothing to go on, \
write a minimal, honest description instead of padding it.
- enrichment_confidence: "high", "medium", or "low"
- enrichment_status: "enriched" or "insufficient_data"
- enrichment_sources: a list of URLs actually used (empty list if none)

CRITICAL RULES, learned from prior manual review of this exact dataset:
1. The scraped "about" data may include a "Buys used goods" flag that is WRONG a meaningful \
fraction of the time -- it does not mean the store buys antiques specifically, and has been \
confirmed incorrect against real store websites more than once. NEVER assert buys_antiques=true \
on the strength of that flag alone. Only assert true if the website text explicitly confirms it \
buys items from the public. If there's no corroborating source, set buys_antiques to null and \
buying_model to "unclear", even if the raw flag said true.
2. If no website text is provided, do NOT invent a description. Set \
enrichment_status="insufficient_data", enrichment_confidence="low", and write only what you can \
honestly support (it is fine for primary_specialty to be a low-confidence guess based only on the \
name, explicitly marked as such).
3. Output ONLY the JSON object as your final answer -- no other text before or after it."""


def fetch_website_text(url: str) -> str | None:
    try:
        resp = requests.get(
            url, timeout=10,
            headers={"User-Agent": "Mozilla/5.0 (compatible; AntiqueDirectoryBot/0.1)"},
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  fetch failed for {url}: {e}")
        return None

    soup = BeautifulSoup(resp.text, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()
    text = re.sub(r"\n{3,}", "\n\n", soup.get_text("\n", strip=True))
    return text[:MAX_CHARS]


def build_user_prompt(record: dict, site_text: str | None) -> str:
    fields = {
        k: record.get(k)
        for k in [
            "name", "category", "type", "subtypes", "phone", "website", "address",
            "city", "state", "rating", "reviews", "working_hours", "about",
        ]
    }
    prompt = f"Scraped record:\n{json.dumps(fields, indent=2)}\n\n"
    if site_text:
        prompt += f"Cleaned website text (from {record['website']}):\n{site_text}\n\n"
    else:
        prompt += "No website available for this record.\n\n"
    prompt += "Enrich this store."
    return prompt


def main():
    with open("/tmp/claude-antique-scratch/model_test_sample.json") as f:
        sample = json.load(f)

    client = anthropic.Anthropic()
    requests_list = []

    for record in sample:
        site_text = None
        if record.get("website"):
            print(f"fetching {record['name']}: {record['website']}")
            site_text = fetch_website_text(record["website"])
        user_prompt = build_user_prompt(record, site_text)
        requests_list.append(
            Request(
                custom_id=record["place_id"],
                params=MessageCreateParamsNonStreaming(
                    model=MODEL_ID,
                    max_tokens=1000,
                    system=SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": user_prompt}],
                ),
            )
        )

    print(f"\nSubmitting batch with {len(requests_list)} requests (no tools, own-scraped text)...")
    batch = client.messages.batches.create(requests=requests_list)
    print(f"Batch ID: {batch.id}")
    print(f"Status: {batch.processing_status}")

    with open("/tmp/claude-antique-scratch/scrape_batch_id.txt", "w") as f:
        f.write(batch.id)


if __name__ == "__main__":
    main()
