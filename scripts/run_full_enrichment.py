#!/usr/bin/env python3
"""Full Phase 1+2 enrichment run: own-scraping (homepage + subpages) + one-shot
Sonnet 5, no agentic tools. Chunked so there's a real cost checkpoint between
chunks -- stops before submitting further work if cumulative cost crosses
COST_LIMIT_USD. Resumable: progress is saved to STATE_PATH after every chunk.
"""
import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, wait

import anthropic
import httpx2
import psycopg2
import psycopg2.extras
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
from scrape_and_batch_v2 import SYSTEM_PROMPT, MODEL_ID, scrape_site, build_user_prompt  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

COST_LIMIT_USD = 100.0
CHUNK_SIZE = 3800
SONNET_BATCH_RATES = (1.0, 5.0)  # input $/MTok, output $/MTok, batch tier
STATE_PATH = "/tmp/claude-antique-scratch/full_enrichment_state.json"
LOG_PATH = "/tmp/claude-antique-scratch/full_enrichment.log"


def log(msg):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)


def load_state():
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH) as f:
            return json.load(f)
    return {"completed_chunks": [], "cumulative_cost": 0.0, "stopped": False}


def save_state(state):
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)


def db_connect():
    return with_retry(psycopg2.connect, os.environ["SUPABASE_DB_URL"],
                       connect_timeout=10, max_attempts=30)


def fetch_pending_records():
    conn = db_connect()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        select place_id, name, category, type, subtypes, phone, website, address, city, state,
               rating, reviews, working_hours, about
        from stores
        where enrichment_phase in (1, 2) and enrichment_status is null
        order by priority_score desc
    """)
    rows = cur.fetchall()
    conn.close()
    return rows


def extract_json(text):
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def scrape_chunk(records, max_workers=15, overall_timeout=1800):
    """Returns {place_id: (site_text, urls)}. Hard overall deadline so a single
    hung fetch (e.g. a DNS resolution that ignores the per-request timeout)
    can't stall the whole chunk indefinitely -- any tasks not done by the
    deadline are abandoned and treated as no-website-text."""
    results = {}

    def task(record):
        if not record.get("website"):
            return record["place_id"], ("", [])
        try:
            return record["place_id"], scrape_site(record["website"])
        except Exception as e:
            log(f"  scrape error for {record['name']}: {e}")
            return record["place_id"], ("", [])

    pool = ThreadPoolExecutor(max_workers=max_workers)
    try:
        futures = {pool.submit(task, r): r for r in records}
        done, not_done = wait(futures.keys(), timeout=overall_timeout)
        for fut in done:
            place_id, result = fut.result()
            results[place_id] = result
        for fut in not_done:
            record = futures[fut]
            log(f"  scrape TIMED OUT (overall deadline) for {record['name']}, treating as no site text")
            results[record["place_id"]] = ("", [])
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    return results


def with_retry(fn, *args, max_attempts=30, **kwargs):
    """Retry on transient network errors (e.g. a wifi network change) with a
    capped backoff -- tolerates up to ~25 minutes of connectivity loss."""
    delay = 10
    for attempt in range(1, max_attempts + 1):
        try:
            return fn(*args, **kwargs)
        except (anthropic.APIConnectionError, anthropic.APITimeoutError,
                anthropic.InternalServerError, anthropic.RateLimitError,
                psycopg2.OperationalError, psycopg2.InterfaceError,
                httpx2.TimeoutException, httpx2.TransportError) as e:
            if attempt == max_attempts:
                raise
            log(f"  network/API error ({type(e).__name__}), retrying in {delay}s "
                f"(attempt {attempt}/{max_attempts})...")
            time.sleep(delay)
            delay = min(delay * 1.5, 60)


def submit_and_wait(client, requests_list):
    batch = with_retry(client.messages.batches.create, requests=requests_list)
    log(f"  batch {batch.id} submitted ({len(requests_list)} requests)")
    while True:
        batch = with_retry(client.messages.batches.retrieve, batch.id)
        if batch.processing_status == "ended":
            break
        time.sleep(60)
    log(f"  batch {batch.id} ended: {batch.request_counts}")
    # wrap the full list() materialization, not just the call -- results() is a
    # lazy/paginated iterator, so network calls happen during iteration too
    return with_retry(lambda: list(client.messages.batches.results(batch.id)))


def write_results_to_db(results):
    conn = db_connect()
    cur = conn.cursor()
    chunk_cost = 0.0
    n_enriched, n_insufficient, n_failed = 0, 0, 0

    for r in results:
        place_id = r.custom_id
        if r.result.type != "succeeded":
            cur.execute(
                "update stores set enrichment_status = 'failed', enriched_at = now() where place_id = %s",
                (place_id,),
            )
            n_failed += 1
            continue

        msg = r.result.message
        in_rate, out_rate = SONNET_BATCH_RATES
        chunk_cost += msg.usage.input_tokens / 1e6 * in_rate + msg.usage.output_tokens / 1e6 * out_rate

        text = "\n".join(b.text for b in msg.content if b.type == "text")
        data = extract_json(text)
        if data is None:
            cur.execute(
                "update stores set enrichment_status = 'failed', enriched_at = now() where place_id = %s",
                (place_id,),
            )
            n_failed += 1
            continue

        status = data.get("enrichment_status", "insufficient_data")
        if status == "enriched":
            n_enriched += 1
        else:
            n_insufficient += 1

        cur.execute("""
            update stores set
                primary_specialty = %(primary_specialty)s,
                business_model = %(business_model)s,
                buys_antiques = %(buys_antiques)s,
                buying_model = %(buying_model)s,
                enriched_description = %(enriched_description)s,
                enrichment_sources = %(enrichment_sources)s,
                enrichment_confidence = %(enrichment_confidence)s,
                enrichment_status = %(enrichment_status)s,
                enriched_at = now()
            where place_id = %(place_id)s
        """, {
            "place_id": place_id,
            "primary_specialty": data.get("primary_specialty"),
            "business_model": data.get("business_model"),
            "buys_antiques": data.get("buys_antiques"),
            "buying_model": data.get("buying_model"),
            "enriched_description": data.get("enriched_description"),
            "enrichment_sources": json.dumps(data.get("enrichment_sources", [])),
            "enrichment_confidence": data.get("enrichment_confidence"),
            "enrichment_status": status,
        })

    conn.commit()
    conn.close()
    log(f"  wrote to DB: {n_enriched} enriched, {n_insufficient} insufficient_data, {n_failed} failed")
    return chunk_cost


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--test-limit", type=int, default=None,
                         help="only process the first N pending records, as a single chunk, "
                              "and skip state/resume tracking -- for validating the pipeline")
    parser.add_argument("--chunk-index", type=int, default=None,
                         help="process only this single chunk (0-indexed) standalone, so it can "
                              "run in parallel with the main sequential loop processing a "
                              "different chunk. Uses its own state file to avoid collisions.")
    args = parser.parse_args()

    if args.chunk_index is not None:
        global STATE_PATH
        STATE_PATH = f"/tmp/claude-antique-scratch/full_enrichment_state_chunk{args.chunk_index}.json"
        records = fetch_pending_records()
        chunks = [records[i:i + CHUNK_SIZE] for i in range(0, len(records), CHUNK_SIZE)]
        if args.chunk_index >= len(chunks):
            log(f"chunk index {args.chunk_index} out of range ({len(chunks)} chunks total)")
            return
        chunk = chunks[args.chunk_index]
        log(f"STANDALONE CHUNK {args.chunk_index} ({len(chunk)} records)")
        client = anthropic.Anthropic()
        log("Scraping websites...")
        scraped = scrape_chunk(chunk)
        n_with_site = sum(1 for t, _ in scraped.values() if t)
        log(f"Scraped {n_with_site}/{len(chunk)} with usable website text")
        requests_list = []
        for record in chunk:
            site_text, urls = scraped.get(record["place_id"], ("", []))
            user_prompt = build_user_prompt(record, site_text, urls)
            requests_list.append(Request(
                custom_id=record["place_id"],
                params=MessageCreateParamsNonStreaming(
                    model=MODEL_ID, max_tokens=1000, system=SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": user_prompt}],
                ),
            ))
        results = submit_and_wait(client, requests_list)
        chunk_cost = with_retry(write_results_to_db, results)
        state = {"completed_chunks": [args.chunk_index], "cumulative_cost": chunk_cost, "stopped": False}
        save_state(state)
        log(f"STANDALONE CHUNK {args.chunk_index} complete. Cost: ${chunk_cost:.2f}")
        return

    state = load_state()

    if state["stopped"] and not args.test_limit:
        log("Run was previously stopped (cost limit). Not resuming automatically.")
        return

    records = fetch_pending_records()
    log(f"Pending records: {len(records)}")

    if args.test_limit:
        records = records[:args.test_limit]
        log(f"TEST MODE: limited to {len(records)} records, single chunk, no state tracking")
        client = anthropic.Anthropic()
        log("Scraping websites...")
        scraped = scrape_chunk(records)
        n_with_site = sum(1 for t, _ in scraped.values() if t)
        log(f"Scraped {n_with_site}/{len(records)} with usable website text")
        requests_list = []
        for record in records:
            site_text, urls = scraped.get(record["place_id"], ("", []))
            user_prompt = build_user_prompt(record, site_text, urls)
            requests_list.append(Request(
                custom_id=record["place_id"],
                params=MessageCreateParamsNonStreaming(
                    model=MODEL_ID, max_tokens=1000, system=SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": user_prompt}],
                ),
            ))
        results = submit_and_wait(client, requests_list)
        chunk_cost = with_retry(write_results_to_db, results)
        log(f"TEST MODE complete. Cost: ${chunk_cost:.4f}")
        return

    chunks = [records[i:i + CHUNK_SIZE] for i in range(0, len(records), CHUNK_SIZE)]
    log(f"Split into {len(chunks)} chunks of up to {CHUNK_SIZE}")

    client = anthropic.Anthropic()

    for i, chunk in enumerate(chunks):
        if i in state["completed_chunks"]:
            log(f"Chunk {i} already completed, skipping")
            continue

        standalone_path = f"/tmp/claude-antique-scratch/full_enrichment_state_chunk{i}.json"
        if os.path.exists(standalone_path):
            with open(standalone_path) as f:
                standalone_state = json.load(f)
            state["cumulative_cost"] += standalone_state["cumulative_cost"]
            state["completed_chunks"].append(i)
            save_state(state)
            log(f"Chunk {i} was completed by a standalone parallel run "
                f"(cost ${standalone_state['cumulative_cost']:.2f}), absorbing and skipping")
            continue

        log(f"=== Chunk {i+1}/{len(chunks)} ({len(chunk)} records) ===")
        log("Scraping websites...")
        scraped = scrape_chunk(chunk)
        n_with_site = sum(1 for t, _ in scraped.values() if t)
        log(f"Scraped {n_with_site}/{len(chunk)} with usable website text")

        requests_list = []
        for record in chunk:
            site_text, urls = scraped.get(record["place_id"], ("", []))
            user_prompt = build_user_prompt(record, site_text, urls)
            requests_list.append(Request(
                custom_id=record["place_id"],
                params=MessageCreateParamsNonStreaming(
                    model=MODEL_ID, max_tokens=1000, system=SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": user_prompt}],
                ),
            ))

        results = submit_and_wait(client, requests_list)
        chunk_cost = with_retry(write_results_to_db, results)

        state["cumulative_cost"] += chunk_cost
        state["completed_chunks"].append(i)
        log(f"Chunk {i+1} cost: ${chunk_cost:.2f}  |  cumulative: ${state['cumulative_cost']:.2f}")
        save_state(state)

        if state["cumulative_cost"] > COST_LIMIT_USD:
            state["stopped"] = True
            save_state(state)
            log(f"ALERT: cumulative cost ${state['cumulative_cost']:.2f} exceeded limit "
                f"${COST_LIMIT_USD:.2f}. Stopping before next chunk.")
            return

    log(f"All chunks complete. Total cost: ${state['cumulative_cost']:.2f}")


if __name__ == "__main__":
    main()
