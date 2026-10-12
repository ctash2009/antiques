#!/usr/bin/env python3
"""Enhanced scraper: homepage + likely subpages (about/sell/consign/appraisal),
still zero agentic tool cost -- just a few extra free HTTP requests per record.
Same 24-record sample and prompt rules as scrape_and_batch.py.
"""
import json
import os
import re
from urllib.parse import urljoin, urlparse

import anthropic
import requests
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

MODEL_ID = "claude-sonnet-5"
MAX_CHARS_PER_PAGE = 6000
MAX_PAGES = 3
SUBPAGE_GUESSES = ["about", "about-us", "sell-to-us", "we-buy-antiques", "consignment", "sell", "pages/about-us"]
KEYWORDS = re.compile(r"sell|buy|consign|appraisal|about|trade", re.I)
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; AntiqueDirectoryBot/0.1)"}

SYSTEM_PROMPT = """You are enriching a directory listing for an antique/vintage store, based on a \
scraped Google Maps record plus (when available) cleaned text scraped from the store's real website \
(homepage plus likely relevant subpages).

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


def clean_text(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()
    return re.sub(r"\n{3,}", "\n\n", soup.get_text("\n", strip=True))


def fetch(url: str) -> tuple[str, BeautifulSoup] | None:
    try:
        # explicit (connect, read) timeout tuple -- a single scalar timeout can
        # still hang past its nominal value on some DNS-resolution edge cases
        resp = requests.get(url, timeout=(5, 10), headers=HEADERS)
        resp.raise_for_status()
    except requests.RequestException:
        return None
    return resp.text, BeautifulSoup(resp.text, "lxml")


def find_candidate_links(base_url: str, soup: BeautifulSoup) -> list[str]:
    candidates = []
    for a in soup.find_all("a", href=True):
        text = a.get_text(" ", strip=True)
        href = a["href"]
        if KEYWORDS.search(text) or KEYWORDS.search(href):
            full = urljoin(base_url, href)
            if urlparse(full).netloc == urlparse(base_url).netloc:
                candidates.append(full)
    return candidates


def scrape_site(url: str) -> tuple[str, list[str]]:
    """Returns (combined cleaned text, list of URLs actually used)."""
    pages_text = []
    used_urls = []

    home = fetch(url)
    if home is None:
        return "", []
    home_html, home_soup = home
    pages_text.append(clean_text(home_html)[:MAX_CHARS_PER_PAGE])
    used_urls.append(url)

    candidates = find_candidate_links(url, home_soup)
    for guess in SUBPAGE_GUESSES:
        candidates.append(urljoin(url, guess))

    seen = set(used_urls)
    for link in candidates:
        if len(used_urls) >= MAX_PAGES:
            break
        if link in seen:
            continue
        seen.add(link)
        result = fetch(link)
        if result is None:
            continue
        html, _ = result
        text = clean_text(html)[:MAX_CHARS_PER_PAGE]
        if len(text) > 100:
            pages_text.append(text)
            used_urls.append(link)

    return "\n\n---\n\n".join(pages_text), used_urls


def build_user_prompt(record: dict, site_text: str, urls: list[str]) -> str:
    fields = {
        k: record.get(k)
        for k in [
            "name", "category", "type", "subtypes", "phone", "website", "address",
            "city", "state", "rating", "reviews", "working_hours", "about",
        ]
    }
    prompt = f"Scraped record:\n{json.dumps(fields, indent=2, default=str)}\n\n"
    if site_text:
        prompt += f"Cleaned website text (from {', '.join(urls)}):\n{site_text}\n\n"
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
        site_text, urls = "", []
        if record.get("website"):
            print(f"scraping {record['name']}: {record['website']}")
            site_text, urls = scrape_site(record["website"])
            print(f"  -> {len(urls)} page(s): {urls}")
        user_prompt = build_user_prompt(record, site_text, urls)
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

    print(f"\nSubmitting batch with {len(requests_list)} requests (enhanced scraping)...")
    batch = client.messages.batches.create(requests=requests_list)
    print(f"Batch ID: {batch.id}")
    with open("/tmp/claude-antique-scratch/scrape_v2_batch_id.txt", "w") as f:
        f.write(batch.id)


if __name__ == "__main__":
    main()
