#!/usr/bin/env python3
"""Load an Outscraper Google Maps CSV export into the Supabase `stores` table.

Usage:
    python scripts/load_stores.py path/to/export.csv [--limit N]

Requires SUPABASE_DB_URL in the environment (or .env.local at the repo root) --
the direct Postgres connection string from Supabase (Project Settings ->
Database -> Connection string). The anon/publishable key used by the web app
can't run DDL or bulk writes past Row Level Security, so this script needs
the database connection string instead.
"""

import argparse
import hashlib
import json
import math
import os
import re
import sys

import pandas as pd
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

MIN_ABOUT_FILL_RATIO = 0.005  # attribute must appear on >=0.5% of rows to become a real column
BATCH_SIZE = 2000

# columns that must stay text no matter what they look like -- postal codes,
# phone numbers, and Google's IDs, several of which exceed bigint range or
# get corrupted by numeric parsing (leading zeros, scientific notation).
TEXT_ID_COLUMNS = {
    "place_id", "google_id", "cid", "kgmid", "reviews_id",
    "owner_id", "located_google_id", "h3", "postal_code", "phone",
}

INT_COLUMNS = {"reviews", "reviews_per_score_1", "reviews_per_score_2",
               "reviews_per_score_3", "reviews_per_score_4", "reviews_per_score_5",
               "photos_count"}
FLOAT_COLUMNS = {"latitude", "longitude"}
NUMERIC_COLUMNS = {"rating"}
BOOL_COLUMNS = {"area_service", "verified"}
JSON_COLUMNS = {"working_hours", "other_hours", "popular_times", "posts",
                 "reviews_per_score", "about"}

# base table columns, in insert order. (csv_column, db_column, sql_type)
BASE_COLUMNS = [
    ("place_id", "place_id", "text"),
    ("google_id", "google_id", "text"),
    ("cid", "cid", "text"),
    ("kgmid", "kgmid", "text"),
    ("reviews_id", "reviews_id", "text"),
    ("query", "search_query", "text"),
    ("name", "name", "text"),
    ("name_for_emails", "name_for_emails", "text"),
    ("subtypes", "subtypes", "text"),
    ("category", "category", "text"),
    ("type", "type", "text"),
    ("phone", "phone", "text"),
    ("website", "website", "text"),
    ("address", "address", "text"),
    ("street", "street", "text"),
    ("city", "city", "text"),
    ("county", "county", "text"),
    ("state", "state", "text"),
    ("state_code", "state_code", "text"),
    ("postal_code", "postal_code", "text"),
    ("country", "country", "text"),
    ("country_code", "country_code", "text"),
    ("latitude", "latitude", "double precision"),
    ("longitude", "longitude", "double precision"),
    ("h3", "h3", "text"),
    ("time_zone", "time_zone", "text"),
    ("plus_code", "plus_code", "text"),
    ("area_service", "area_service", "boolean"),
    ("rating", "rating", "numeric"),
    ("reviews", "reviews", "integer"),
    ("reviews_link", "reviews_link", "text"),
    ("reviews_tags", "reviews_tags", "text"),
    ("reviews_per_score", "reviews_per_score", "jsonb"),
    ("reviews_per_score_1", "reviews_per_score_1", "integer"),
    ("reviews_per_score_2", "reviews_per_score_2", "integer"),
    ("reviews_per_score_3", "reviews_per_score_3", "integer"),
    ("reviews_per_score_4", "reviews_per_score_4", "integer"),
    ("reviews_per_score_5", "reviews_per_score_5", "integer"),
    ("photos_count", "photos_count", "integer"),
    ("photo", "photo", "text"),
    ("street_view", "street_view", "text"),
    ("logo", "logo", "text"),
    ("located_in", "located_in", "text"),
    ("located_google_id", "located_google_id", "text"),
    ("business_status", "business_status", "text"),
    ("working_hours", "working_hours", "jsonb"),
    ("working_hours_csv_compatible", "working_hours_csv_compatible", "text"),
    ("other_hours", "other_hours", "jsonb"),
    ("popular_times", "popular_times", "jsonb"),
    ("typical_time_spent", "typical_time_spent", "text"),
    ("range", "price_range", "text"),
    ("prices", "prices", "text"),
    ("reservation_links", "reservation_links", "text"),
    ("booking_appointment_link", "booking_appointment_link", "text"),
    ("menu_link", "menu_link", "text"),
    ("order_links", "order_links", "text"),
    ("about", "about", "jsonb"),
    ("description", "description", "text"),
    ("posts", "posts", "jsonb"),
    ("verified", "verified", "boolean"),
    ("owner_id", "owner_id", "text"),
    ("owner_title", "owner_title", "text"),
    ("owner_link", "owner_link", "text"),
    ("location_link", "location_link", "text"),
    ("location_reviews_link", "location_reviews_link", "text"),
]


def slugify(label: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    return s


def about_column_name(category: str, attribute: str, taken: set) -> str:
    name = "about_" + slugify(f"{category}_{attribute}")
    if len(name) > 63:
        digest = hashlib.sha1(name.encode()).hexdigest()[:8]
        name = name[:54] + "_" + digest
    base, i = name, 2
    while name in taken:
        name = f"{base}_{i}"
        i += 1
    return name


def discover_about_columns(path: str, total_rows: int) -> list[tuple[str, str, str]]:
    """First pass: find which (category, attribute) about-flags are boolean
    and common enough to deserve a real column. Returns
    [(category, attribute, db_column), ...]."""
    counts = {}
    for chunk in pd.read_csv(path, usecols=["about"], dtype=str, chunksize=20000,
                              keep_default_na=True, na_values=["None"]):
        for raw in chunk["about"].dropna():
            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue
            for category, attrs in data.items():
                if not isinstance(attrs, dict):
                    continue
                for attribute, value in attrs.items():
                    if isinstance(value, bool):
                        counts[(category, attribute)] = counts.get((category, attribute), 0) + 1

    threshold = math.ceil(total_rows * MIN_ABOUT_FILL_RATIO)
    kept = sorted(
        [(cat, attr, n) for (cat, attr), n in counts.items() if n >= threshold],
        key=lambda t: -t[2],
    )
    taken: set = set()
    result = []
    for cat, attr, n in kept:
        col = about_column_name(cat, attr, taken)
        taken.add(col)
        result.append((cat, attr, col))
    return result


def build_create_table_sql(about_columns: list[tuple[str, str, str]]) -> str:
    lines = ["id bigint generated always as identity primary key"]
    for _, db_col, sql_type in BASE_COLUMNS:
        lines.append(f'"{db_col}" {sql_type}')
    for _, _, db_col in about_columns:
        lines.append(f'"{db_col}" boolean')
    lines.append('"created_at" timestamptz not null default now()')
    lines.append('"updated_at" timestamptz not null default now()')
    lines.append('unique ("place_id")')
    body = ",\n    ".join(lines)
    return f"create table if not exists stores (\n    {body}\n);"


def clean(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, str) and (value == "" or value == "None"):
        return None
    return value


def to_int(value):
    value = clean(value)
    if value is None:
        return None
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return None


def to_float(value):
    value = clean(value)
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def to_bool(value):
    value = clean(value)
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() == "true"


def to_json(value):
    value = clean(value)
    if value is None:
        return None
    try:
        return psycopg2.extras.Json(json.loads(value))
    except (json.JSONDecodeError, TypeError):
        return None


def parse_about_flags(raw, about_columns):
    raw = clean(raw)
    flags = {db_col: None for _, _, db_col in about_columns}
    if raw is None:
        return flags
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return flags
    lookup = {(cat, attr): db_col for cat, attr, db_col in about_columns}
    for category, attrs in data.items():
        if not isinstance(attrs, dict):
            continue
        for attribute, value in attrs.items():
            db_col = lookup.get((category, attribute))
            if db_col is not None and isinstance(value, bool):
                flags[db_col] = value
    return flags


def build_row(record: dict, about_columns) -> dict:
    row = {}
    for csv_col, db_col, sql_type in BASE_COLUMNS:
        raw = record.get(csv_col)
        if db_col in INT_COLUMNS:
            row[db_col] = to_int(raw)
        elif db_col in FLOAT_COLUMNS:
            row[db_col] = to_float(raw)
        elif db_col in NUMERIC_COLUMNS:
            row[db_col] = to_float(raw)
        elif db_col in BOOL_COLUMNS:
            row[db_col] = to_bool(raw)
        elif db_col in JSON_COLUMNS:
            row[db_col] = to_json(raw)
        else:
            row[db_col] = clean(raw)
    row.update(parse_about_flags(record.get("about"), about_columns))
    return row


def load(csv_path: str, conn, about_columns, limit=None):
    all_db_columns = [db_col for _, db_col, _ in BASE_COLUMNS] + [c for _, _, c in about_columns]
    insert_cols = ", ".join(f'"{c}"' for c in all_db_columns)
    update_cols = ", ".join(f'"{c}" = excluded."{c}"' for c in all_db_columns if c != "place_id")
    sql = (
        f"insert into stores ({insert_cols}) values %s "
        f'on conflict ("place_id") do update set {update_cols}, "updated_at" = now()'
    )

    total = 0
    with conn.cursor() as cur:
        for chunk in pd.read_csv(csv_path, dtype=str, chunksize=BATCH_SIZE,
                                  keep_default_na=True, na_values=["None"]):
            if limit is not None and total >= limit:
                break
            records = chunk.to_dict("records")
            if limit is not None:
                records = records[: max(0, limit - total)]
            rows = [build_row(r, about_columns) for r in records]
            values = [tuple(r[c] for c in all_db_columns) for r in rows]
            psycopg2.extras.execute_values(cur, sql, values, page_size=BATCH_SIZE)
            conn.commit()
            total += len(rows)
            print(f"  loaded {total} rows...", file=sys.stderr)
    return total


def print_fill_rates(conn, about_columns):
    all_db_columns = [db_col for _, db_col, _ in BASE_COLUMNS] + [c for _, _, c in about_columns]
    counts_sql = ", ".join(f'count("{c}")' for c in all_db_columns)
    with conn.cursor() as cur:
        cur.execute(f"select count(*), {counts_sql} from stores")
        row = cur.fetchone()
    total = row[0]
    print(f"\nFill rates ({total} total rows):")
    print(f"{'column':<45} {'filled':>8}   {'pct':>6}")
    for col, filled in zip(all_db_columns, row[1:]):
        pct = (filled / total * 100) if total else 0
        print(f"{col:<45} {filled:>8}   {pct:5.1f}%")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path")
    parser.add_argument("--limit", type=int, default=None, help="only load the first N rows (for a dry run)")
    args = parser.parse_args()

    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        sys.exit(
            "SUPABASE_DB_URL is not set. Add it to .env.local -- find it in the "
            "Supabase dashboard under Project Settings > Database > Connection string "
            "(use the 'Transaction pooler' URI and fill in your database password)."
        )

    total_rows = sum(1 for _ in open(args.csv_path, encoding="utf-8")) - 1
    print(f"Scanning {args.csv_path} ({total_rows} rows) for about-flag columns...", file=sys.stderr)
    about_columns = discover_about_columns(args.csv_path, total_rows)
    print(f"Flattening {len(about_columns)} about-attributes into boolean columns "
          f"(>= {MIN_ABOUT_FILL_RATIO:.1%} fill rate); raw JSON kept in 'about' column too.",
          file=sys.stderr)

    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor() as cur:
            cur.execute(build_create_table_sql(about_columns))
        conn.commit()

        loaded = load(args.csv_path, conn, about_columns, limit=args.limit)
        print(f"\nDone. Upserted {loaded} rows.", file=sys.stderr)

        print_fill_rates(conn, about_columns)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
