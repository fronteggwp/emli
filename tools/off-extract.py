# Выгрузка товаров России, Беларуси и стран СНГ из полного экспорта Open Food Facts (CSV, ~1,3 ГБ, обновляется ежедневно).
# 1) curl -L -C - -o tools/.cache/off-products.csv.gz https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz
# 2) python tools/off-extract.py            → tools/.cache/off-cis.json
# 3) node tools/barcode-import.mjs --file   → общая база штрихкодов Emli
# Данные Open Food Facts — лицензия ODbL.
import os
import time

import duckdb

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, ".cache", "off-products.csv.gz").replace(os.sep, "/")
OUT = os.path.join(HERE, ".cache", "off-cis.json").replace(os.sep, "/")
COUNTRIES = ["russia", "belarus", "kazakhstan", "ukraine", "uzbekistan", "armenia", "georgia", "moldova", "kyrgyzstan", "azerbaijan", "tajikistan"]
# Префиксы GS1: 460–469 Россия, 481 Беларусь, 482 Украина, 484 Молдова, 485 Армения, 486 Грузия, 487 Казахстан, 470 Киргизия, 476 Азербайджан, 478 Узбекистан
PREFIX = r"^(46[0-9]|470|476|478|481|482|484|485|486|487)\d{10}$"

country_sql = " OR ".join(f"countries_tags LIKE '%en:{c}%'" for c in COUNTRIES)
con = duckdb.connect()
con.sql("SET enable_progress_bar = false;")
t0 = time.time()
con.sql(
    f"""
COPY (
  SELECT
    code, brands, product_quantity, serving_quantity,
    product_name AS name_main,
    generic_name AS name_any,
    "energy-kcal_100g" AS kcal, "energy-kj_100g" AS kj, "energy_100g" AS energy,
    proteins_100g AS protein, fat_100g AS fat, carbohydrates_100g AS carbs,
    quantity, image_small_url AS image_url
  FROM read_csv('{SRC}', delim = '\t', quote = '', header = true, all_varchar = true, ignore_errors = true, max_line_size = 20000000)
  WHERE ({country_sql}) OR regexp_matches(code, '{PREFIX}')
) TO '{OUT}' (FORMAT json)
"""
)
n = con.sql(f"SELECT count(*) FROM read_json_auto('{OUT}')").fetchone()[0]
print(f"готово: {n} товаров за {time.time() - t0:.0f} с → {OUT}")
