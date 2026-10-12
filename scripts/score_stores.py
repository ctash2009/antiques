#!/usr/bin/env python3
"""Compute enrichment priority scores and phase into the Supabase `stores` table.

Adds/refreshes three columns:
  priority_score    -- 0-1 composite (UX popularity + data completeness + SEO signal)
  city_rank         -- rank of this store within its (city, state), 1 = highest priority
  enrichment_phase  -- 1 = enrich first (top-ranked store in every city)
                       2 = enrich next (2nd-ranked store, only in cities that have one)
                       0 = not yet scheduled

Usage:
    python scripts/score_stores.py path/to/candidates.csv
"""

import argparse
import os
import sys

import numpy as np
import pandas as pd
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

STRONG_RETAIL_CATEGORIES = {
    "Antique store", "Antique furniture store", "Collectibles store",
    "Antique furniture restoration service", "Auction house",
}


def compute_scores(df: pd.DataFrame) -> pd.DataFrame:
    reviews = pd.to_numeric(df["reviews"], errors="coerce").fillna(0)
    rating = pd.to_numeric(df["rating"], errors="coerce")
    photos = pd.to_numeric(df["photos_count"], errors="coerce").fillna(0)

    popularity = np.minimum(np.log1p(reviews) / np.log1p(50), 1.0)
    rating_component = np.where(reviews >= 3, rating.fillna(3.5) / 5, 0.5)
    ux_score = 0.6 * popularity + 0.4 * rating_component

    completeness = (
        df["phone"].notna().astype(int)
        + df["website"].notna().astype(int)
        + df["working_hours"].notna().astype(int)
        + (photos > 0).astype(int)
        + df["about"].notna().astype(int)
    ) / 5.0

    category_confident = df["category"].isin(STRONG_RETAIL_CATEGORIES).astype(float)
    no_website_bonus = df["website"].isna().astype(float) * 0.15
    buys_signal_bonus = df["about"].str.contains("Buys used goods", case=False, na=False).astype(float) * 0.15
    seo_score = (0.5 * category_confident + no_website_bonus + buys_signal_bonus).clip(0, 1)

    df = df.copy()
    df["priority_score"] = (0.4 * ux_score + 0.3 * completeness + 0.3 * seo_score).round(4)
    df["city_rank"] = (
        df.groupby(["city", "state"], dropna=False)["priority_score"]
        .rank(ascending=False, method="first")
        .astype(int)
    )
    df["enrichment_phase"] = np.select(
        [df["city_rank"] == 1, df["city_rank"] == 2],
        [1, 2],
        default=0,
    )
    return df


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path")
    args = parser.parse_args()

    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        sys.exit("SUPABASE_DB_URL is not set in .env.local")

    df = pd.read_csv(args.csv_path, dtype=str)
    scored = compute_scores(df)

    print(f"phase 1 (top store, every city): {(scored['enrichment_phase'] == 1).sum()}", file=sys.stderr)
    print(f"phase 2 (2nd store, multi-store cities): {(scored['enrichment_phase'] == 2).sum()}", file=sys.stderr)
    print(f"phase 0 (not yet scheduled): {(scored['enrichment_phase'] == 0).sum()}", file=sys.stderr)

    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "alter table stores "
                "add column if not exists priority_score numeric, "
                "add column if not exists city_rank integer, "
                "add column if not exists enrichment_phase smallint"
            )
        conn.commit()

        rows = list(
            zip(
                scored["place_id"],
                scored["priority_score"],
                scored["city_rank"],
                scored["enrichment_phase"],
            )
        )
        sql = (
            "update stores set priority_score = data.score, city_rank = data.rank, "
            "enrichment_phase = data.phase "
            "from (values %s) as data(place_id, score, rank, phase) "
            "where stores.place_id = data.place_id"
        )
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, rows, page_size=2000)
        conn.commit()
        print(f"\nUpdated {len(rows)} rows.", file=sys.stderr)

        with conn.cursor() as cur:
            cur.execute(
                "select enrichment_phase, count(*) from stores group by enrichment_phase order by 1"
            )
            print("\nlive counts by phase in Supabase:", file=sys.stderr)
            for phase, count in cur.fetchall():
                print(f"  phase {phase}: {count}", file=sys.stderr)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
