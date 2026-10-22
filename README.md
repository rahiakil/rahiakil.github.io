# Community Vendor Rubric

Evidence-backed vendor selection rubric and GitHub Pages site, mined from anonymized 2026 food-team WhatsApp chats.

**Live site:** [https://rahiakil.github.io/](https://rahiakil.github.io/) (user Pages from `rahiakil.github.io`)

## Privacy rules (non-negotiable)

- Replace every member name and phone number with stable pseudonyms **before** analysis is written to disk.
- Never publish raw chat text. Use short paraphrases or quotes under 20 words with no identifying details.
- Vendor trade names appear publicly only if `publication.vendors.<id>: true` in `config.yaml`. Default is anonymized (`Vendor 1` … `Vendor 9`).
- Keep `data/raw/`, `data/chats/`, and `data/mapping/` git-ignored. Only derived aggregates go in `/docs`.

## Repository layout

| Path | Purpose |
|------|---------|
| `data/raw/` | Original exports (ignored) |
| `data/chats/` | Pseudonymized text (ignored) |
| `analysis/` | `report.md`, `criteria.csv`, `gaps.csv`, ledger |
| `docs/` | Static site for GitHub Pages |
| `config.yaml` | Weights, gates, publication flags |
| `scripts/` | Anonymize + ledger update |

## Setup

1. Place new WhatsApp exports under `data/raw/<export-name>/chat.txt`.
2. Create a virtualenv if you like; scripts need Python 3.10+.
3. Anonymize:

```bash
python scripts/anonymize_chat.py data/raw/ECH-Food-2026/chat.txt
```

4. Update analysis tables and `docs/data/*.json` when criteria shift.
5. Append scores after each event:

```bash
python scripts/update_ledger.py --event "Spring Picnic" --vendor V3 --score 4.0 --slot snacks
```

6. Preview the site locally:

```bash
cd docs
python -m http.server 8080
```

Open `http://localhost:8080`.

## Deploy to GitHub Pages

This project publishes by copying `docs/` to the root of the `rahiakil.github.io` repository (user site).

```bash
# from ech-vendor-rubric/
gh repo create rahiakil/rahiakil.github.io --public --source=. --remote=origin
# or push docs content to an existing user Pages repo
```

For a project site instead, enable Pages on this repo with source `docs/`.

## Interactive tools

- **Distribution simulator:** assign vendors per event slot; see share bars and concentration warnings against rotation / scale / menu-variety pillars.
- **Scorecard:** weighted 1–5 scores + must-have gates; export CSV or print to PDF locally.

## Re-running analysis on new chats

1. Anonymize the new export.
2. Tag messages into event threads (date clusters + keywords: dinner, menu, catering, order).
3. Update `analysis/criteria.csv` frequencies and evidence snippets.
4. Append rows to `analysis/gaps.csv` when failures recur.
5. Refresh `docs/data/rubric.json` and `docs/data/vendors.json`.
6. Run the yearly checklist in `analysis/yearly_review_checklist.md`.

## License note

Internal community tooling. Do not commit raw WhatsApp exports.
