#!/usr/bin/env python3
"""Poll a Message Batch until it ends, then dump results to JSON."""
import json
import os
import sys
import time

import anthropic
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))


def main():
    batch_id = sys.argv[1]
    out_path = sys.argv[2]
    client = anthropic.Anthropic()

    while True:
        batch = client.messages.batches.retrieve(batch_id)
        counts = batch.request_counts
        print(
            f"status={batch.processing_status} "
            f"processing={counts.processing} succeeded={counts.succeeded} "
            f"errored={counts.errored} canceled={counts.canceled} expired={counts.expired}",
            flush=True,
        )
        if batch.processing_status == "ended":
            break
        time.sleep(60)

    results = []
    for result in client.messages.batches.results(batch_id):
        entry = {"custom_id": result.custom_id, "type": result.result.type}
        if result.result.type == "succeeded":
            msg = result.result.message
            text = "\n".join(b.text for b in msg.content if b.type == "text")
            entry["text"] = text
            entry["usage"] = msg.usage.model_dump()
        elif result.result.type == "errored":
            entry["error"] = result.result.error.model_dump()
        results.append(entry)

    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Wrote {len(results)} results to {out_path}")


if __name__ == "__main__":
    main()
