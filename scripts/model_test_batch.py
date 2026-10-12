#!/usr/bin/env python3
"""Submit a 3-model (Sonnet 5 / Opus 5 / Fable 5.1) comparison batch over the
same 24-record sample, to decide which model to use for the full enrichment run.
"""
import json
import os

import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

MODELS = {
    "sonnet5": "claude-sonnet-5",
    "opus5": "claude-opus-5",
    "fable51": "claude-fable-5-1",
}

SYSTEM_PROMPT = """You are enriching a directory listing for an antique/vintage store, based on a \
scraped Google Maps record plus (when available) the store's real website.

Produce a single JSON object with exactly these fields:
- primary_specialty: a short, specific description of what this store actually specializes in \
(e.g. "Mid-century modern furniture", "Oddities, taxidermy & curiosities", "General antiques & \
collectibles"). Base this on real evidence, not the generic Google category alone.
- business_model: one of "single_dealer", "multi_vendor_mall", "appointment_only_showroom", or "unknown"
- buys_antiques: true, false, or null if genuinely unclear
- buying_model: one of "buys_outright", "consignment_vendor_booth", "unclear"
- enriched_description: 2-4 sentences of genuine, specific, factual content about this store, \
grounded in real evidence you found. Never invent facts. If you have almost nothing to go on, \
write a minimal, honest description instead of padding it.
- enrichment_confidence: "high", "medium", or "low"
- enrichment_status: "enriched" or "insufficient_data"
- enrichment_sources: a list of URLs you actually used

CRITICAL RULES, learned from prior manual review of this exact dataset:
1. The scraped "about" data may include a "Buys used goods" flag that is WRONG a meaningful \
fraction of the time -- it does not mean the store buys antiques specifically, and has been \
confirmed incorrect against real store websites more than once. NEVER assert buys_antiques=true \
on the strength of that flag alone. Only assert true if the store's own website or another real \
source explicitly confirms it buys items from the public. If there's no corroborating source, \
set buys_antiques to null and buying_model to "unclear", even if the raw flag said true.
2. If the store has a website, fetch it and read what it actually says before writing anything.
3. If there is no website, try a web search for the store name, city, and state.
4. If you find nothing meaningful after trying, do NOT invent a description. Set \
enrichment_status="insufficient_data", enrichment_confidence="low", and write only what you can \
honestly support (it is fine for primary_specialty to be a low-confidence guess based only on the \
name, explicitly marked as such).
5. Output ONLY the JSON object as your final answer -- no other text before or after it."""


def build_user_prompt(record: dict) -> str:
    fields = {
        k: record.get(k)
        for k in [
            "name", "category", "type", "subtypes", "phone", "website", "address",
            "city", "state", "rating", "reviews", "working_hours", "about",
        ]
    }
    return f"Scraped record:\n{json.dumps(fields, indent=2)}\n\nEnrich this store."


def main():
    with open("/tmp/claude-antique-scratch/model_test_sample.json") as f:
        sample = json.load(f)

    client = anthropic.Anthropic()

    tools = [
        {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 2},
        {"type": "web_search_20260209", "name": "web_search", "max_uses": 2},
    ]

    requests = []
    for record in sample:
        user_prompt = build_user_prompt(record)
        for model_key, model_id in MODELS.items():
            custom_id = f"{model_key}__{record['place_id']}"
            requests.append(
                Request(
                    custom_id=custom_id,
                    params=MessageCreateParamsNonStreaming(
                        model=model_id,
                        max_tokens=4000,
                        system=SYSTEM_PROMPT,
                        tools=tools,
                        messages=[{"role": "user", "content": user_prompt}],
                    ),
                )
            )

    print(f"Submitting batch with {len(requests)} requests "
          f"({len(sample)} records x {len(MODELS)} models)...")
    batch = client.messages.batches.create(requests=requests)
    print(f"Batch ID: {batch.id}")
    print(f"Status: {batch.processing_status}")

    with open("/tmp/claude-antique-scratch/model_test_batch_id.txt", "w") as f:
        f.write(batch.id)


if __name__ == "__main__":
    main()
