1. `npm install`
2. Ensure Python 3 and uv are installed.
3. Install Python deps with uv: `uv sync`
4. Edit `.env` and set:
	- `OPENAI_API_KEY=...`
	- `LLAMA_CLOUD_API_KEY=...` (required for LlamaParse PDF extraction)
5. Start API/static server: `node server.js`
6. Start Vite client: `npm run dev`

Feature notes:
- New tab: Recommended Supplement (pill icon)
- Data source: `historyRecords` entries tagged like `blood-test` and `lipid-test`
- Backend analysis: `scripts/supplement_recommender.py`
- Graphs: rendered from extracted numeric blood/lipid stats

Python architecture:
- PDF reader: LlamaParse (fallback to pypdf if unavailable)
- Structured ingestion: Pydantic models in `scripts/lab_ingestion.py`

Generate standalone graph image:
- `uv run python scripts/plot_test_results.py medical-profile.json .`
- Output file: `user_files/test-results-trends.png`
