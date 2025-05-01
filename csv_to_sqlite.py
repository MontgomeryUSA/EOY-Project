import pathlib, re, sqlite3, csv

CSV_FILE   = pathlib.Path(__file__).with_name("results.csv")
DB_FILE    = pathlib.Path(__file__).with_name("materials.db")

PRICE_RE   = re.compile(r"\$ *([\d,.]+)")
SIZE_RE    = re.compile(r"^\s*([\d/.\-\s×xftinmmcm']+)\s+(.*)$", re.I)

def money(text:str) -> float|None:
    m = PRICE_RE.search(text.replace(",", ""))
    return float(m.group(1)) if m else None

def split_title(title:str):
    """
    "3/4 in. x 10 ft. PVC Schedule 40 Pressure Plain-End Pipe"
        →  size = "3/4 in. x 10 ft."
           name = "PVC Schedule 40 Pressure Plain-End Pipe"
    """
    m = SIZE_RE.match(title)
    if m:
        size, name = m.groups()
        return name.strip(), size.strip()
    return title.strip(), ""            # fallback

# ─────────── create / populate DB
DB_FILE.unlink(missing_ok=True)          # start fresh every run
con = sqlite3.connect(DB_FILE)
cur = con.cursor()
cur.execute("""
    CREATE TABLE prices (
        id        INTEGER PRIMARY KEY,
        full_name TEXT NOT NULL,
        size      TEXT,
        price     REAL,           -- numeric, already $ -> float
        link      TEXT
    )
""")

with CSV_FILE.open(newline="", encoding="utf-8") as fh:
    rdr = csv.DictReader(fh)
    rows = []
    for row in rdr:
        name, size = split_title(row["Title"])
        rows.append((
            name,
            size,
            money(row["Price"]),
            row["URL"]
        ))

cur.executemany("INSERT INTO prices(full_name, size, price, link) VALUES (?,?,?,?)",
                rows)
con.commit()
con.close()
print(f"✓ imported {len(rows)} rows → {DB_FILE}")