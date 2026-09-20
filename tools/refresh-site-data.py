"""Recount the site and rebuild the note search index.

Run this after adding or removing PDFs:

    python tools/refresh-site-data.py

It does two things:

1. Writes assets/notes-index.json — every note on the site (title, subject
   and link), which the search box on the All Subjects page reads.
2. Rewrites the site-wide totals on the sign-in page. Section badges on the
   subject pages count themselves in the browser (assets/counts.js), but the
   sign-in page quotes totals no single page can work out. The mock-test
   figure is left alone: it is not derived from files.

Notes uploaded through /admin/ live in Supabase, not in the repo, so they are
not in the index file; the search box merges those in at runtime.
"""

import html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CARD = re.compile(r'<a class="note-card"[^>]*href="([^"]+\.pdf)"[^>]*>\s*<h2>(.*?)</h2>', re.S)
SUBJECT_CARD = re.compile(r'<a class="note-card" href="\.\./([a-z0-9-]+)/"[^>]*>\s*<h2>(.*?)</h2>', re.S)


def read(path):
    with open(path, encoding="utf-8", newline="") as fh:
        return fh.read()


def write(path, text):
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def clean(text):
    """Plain text: tags stripped and HTML entities decoded (&amp; -> &)."""
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", text))).strip()


def main():
    study = read(ROOT / "study" / "index.html")
    subjects = [(slug, clean(name)) for slug, name in SUBJECT_CARD.findall(study)]
    if not subjects:
        sys.exit("Could not find the subject list on the All Subjects page.")

    notes, pdf_count = [], 0
    for slug, name in subjects:
        page = ROOT / slug / "index.html"
        if not page.exists():
            continue
        for href, title in CARD.findall(read(page)):
            notes.append({"title": clean(title), "subject": name, "url": "../" + slug + "/" + href})
            pdf_count += 1

    notes.sort(key=lambda n: (n["subject"], n["title"]))
    index_path = ROOT / "assets" / "notes-index.json"
    write(index_path, json.dumps(notes, indent=0, ensure_ascii=False) + "\n")

    account_path = ROOT / "account" / "index.html"
    account = read(account_path)
    account = re.sub(r"<li><b>\d+</b><span>PDF notes</span></li>",
                     f"<li><b>{pdf_count}</b><span>PDF notes</span></li>", account, count=1)
    account = re.sub(r"<li><b>\d+</b><span>Subjects</span></li>",
                     f"<li><b>{len(subjects)}</b><span>Subjects</span></li>", account, count=1)
    write(account_path, account)

    print(f"{pdf_count} notes across {len(subjects)} subjects "
          f"-> {index_path.relative_to(ROOT)} and the sign-in page")


if __name__ == "__main__":
    main()
