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

## Project Overview

This project is a local-first emergency and medical helper app called **RescueNow**. It combines:

- A React frontend for the current app UI
- A small Node.js server for local APIs, file serving, and Python integration
- Python utilities for reading lab reports, extracting values, plotting trends, and generating supplement suggestions
- JSON files that act as the app's local database

The app currently covers:

- SOS and emergency contact access
- Nearby hospital, police, fire, and pharmacy search
- First aid and disaster guidance tabs
- A medical profile with blood group, allergies, conditions, doctor, and medicines
- Uploading patient history files such as PDFs, text notes, and images
- Trend extraction from blood/lipid reports
- Supplement and routine recommendations built from uploaded reports

## How The Pieces Work Together

1. The React app in `src/` renders the UI and calls `/api/...` endpoints.
2. `server.js` serves JSON data, uploaded files, and runs Python when supplement analysis is requested.
3. Medical history files are stored in `user_files/`, while their metadata is saved inside `medical-profile.json`.
4. Python scripts read `medical-profile.json`, inspect tagged blood/lipid reports, extract lab values, and return analysis data.
5. The React analysis tab displays the returned recommendations and small trend charts.

## File And Folder Guide

### Frontend

`src/App.jsx`

This is the main React application file and the center of the current UI. It contains:

- The tabbed layout for `home`, `medical`, `supplements`, `nearby`, `wiki`, and `emergency`
- Static emergency datasets like emergency numbers, first-aid content, disaster content, and allowed history tags
- State for contacts, medical profile fields, history uploads, collapsible medical sections, and supplement results
- Handlers for adding/removing medicines, contacts, allergies, conditions, and history records
- Logic to fetch supplement recommendations and render mini trend charts

In short, this file is both the page layout and a lot of the frontend business logic.

`src/main.jsx`

This is the React entry point. It mounts `App` into the DOM element with id `root` and enables `React.StrictMode`.

`src/medicalApi.js`

This file is the frontend API layer. It keeps the React component cleaner by placing all fetch logic in one module. It provides:

- `getMedicalProfile()` and `putMedicalProfile()`
- `getContacts()` and `putContacts()`
- `createHistoryRecord()` and `deleteHistoryRecordFile()`
- `getRecommendedSupplements()`
- Data migration helpers for old and new medical profile formats
- A fetch timeout wrapper so the UI does not wait forever

`index.html`

This is the Vite HTML entry used by the React app. It:

- Loads Tailwind from CDN
- Loads Font Awesome from CDN
- Sets the global font
- Creates the `#root` mount point
- Loads `src/main.jsx`

### Backend

`server.js`

This is the local Node.js backend and static file server. It is one of the most important files in the project. It handles:

- Reading `.env` manually so Python/OpenAI/LlamaParse keys are available
- Serving `E1.html` and project files when used as a local static server
- `GET` and `PUT` for `medical-profile.json`
- `GET` and `PUT` for `contacts.json`
- Saving uploaded history records to `user_files/`
- Deleting saved history files from disk
- Running `scripts/supplement_recommender.py`
- Caching supplement-analysis results in `.cache/supplement-cache.json`

Main API routes:

- `/api/medical-profile`
- `/api/history-records`
- `/api/history-file`
- `/api/recommended-supplements`
- `/api/contacts`

### Python Analysis Utilities

`scripts/lab_ingestion.py`

This file does the heavy lifting for lab-report ingestion. It is responsible for:

- Defining which history tags count as lab-style test files
- Defining metric aliases such as cholesterol, LDL, HDL, triglycerides, glucose, HbA1c, and hemoglobin
- Reading `.pdf`, `.txt`, and similar files
- Using LlamaParse when configured, with `pypdf` fallback for PDFs
- Extracting likely report dates from text
- Scanning report text for numeric measurements
- Producing structured lab records using Pydantic models
- Building chart-ready time series from extracted values

This is the foundation that makes the analysis tab possible.

`scripts/supplement_recommender.py`

This script turns structured lab history into supplement and routine suggestions. It:

- Loads the medical profile and test records
- Builds a compact summary of patient and trend data
- Calls the OpenAI Chat Completions API when `OPENAI_API_KEY` is present
- Falls back to rule-based suggestions if the API is unavailable
- Normalizes the result into simple arrays for the frontend
- Returns chart series, parser information, and API usage details as JSON

This script is executed by `server.js` when the frontend opens or refreshes the analysis tab.

`scripts/plot_test_results.py`

This is a utility script for generating a standalone PNG graph of blood/lipid trends. It:

- Reads the same extracted test-record data as the recommender
- Builds one matplotlib subplot per detected metric
- Saves the result to `user_files/test-results-trends.png` by default

This file is useful for debugging or exporting trend visuals outside the app.

### Data Files

`medical-profile.json`

This is the main persistent data store for the user's medical data. It currently stores:

- `schemaVersion`
- `source`
- `updatedAt`
- `patient.bloodGroup`
- `patient.allergies`
- `patient.conditions`
- `emergencyDoctor.raw`
- `medications`
- `historyRecords`

Each `historyRecords` item stores metadata about a saved note or uploaded file, including:

- `id`
- `title`
- `fileName`
- `fileType`
- `filePath`
- `mimeType`
- `size`
- `tags`
- `notes`
- `uploadedAt`

The actual uploaded file lives in `user_files/`, while this JSON stores the reference to it.

`contacts.json`

This file stores the custom SOS/emergency-circle contacts created by the user from the React app. The built-in emergency numbers are hardcoded in the frontend, but user-added contacts are saved here.

`medical-profile.json` and `contacts.json` together act like the app's lightweight local database.

### Legacy Static App

`E1.html`

This is an older non-React version of the RescueNow UI. It is a large standalone HTML page with embedded styles and JavaScript. It still includes:

- SOS modal UI
- Contact management
- Medical profile editing
- First aid and disaster content
- Nearby facility search

`server.js` serves this file at `/` when running as a plain local static app. It appears to be the earlier implementation kept alongside the newer React version.

`app.js`

This is the JavaScript companion for the older static version. It contains similar logic to the legacy UI in `E1.html`, such as:

- Emergency numbers and content datasets
- Medical profile migration and saving
- Contact rendering and local storage logic
- Wiki tab rendering
- SOS display logic

This file matters mainly for the older app path and for historical reference.

### Build And Tooling Files

`package.json`

Defines the JavaScript project metadata, scripts, and npm dependencies. Important scripts:

- `npm run dev` starts Vite
- `npm run build` creates the production frontend bundle
- `npm run preview` previews the built frontend

`package-lock.json`

npm lockfile. It pins exact JavaScript dependency versions for reproducible installs.

`vite.config.js`

Vite configuration for the React frontend. It:

- Enables the React plugin
- Runs the frontend dev server on port `5173`
- Proxies `/api` requests to `http://localhost:5501`

That proxy is what lets the React dev app talk to `server.js` without cross-origin setup work.

`pyproject.toml`

Defines the Python project metadata and Python dependencies for `uv`. It lists the packages needed for:

- LlamaParse PDF extraction
- Pydantic models
- Matplotlib plotting
- `pypdf` fallback extraction

`requirements.txt`

Alternative plain pip dependency list for the same Python-side packages. This is helpful when `uv` is not being used.

`uv.lock`

The lockfile generated by `uv`. It records exact Python package resolution so installs stay consistent.

### Generated And Runtime Folders

`user_files/`

This folder stores user-created or uploaded history files. Based on the current project state, it includes examples such as:

- Uploaded blood-test PDFs
- Saved text notes
- Generated graph images

These files are runtime data, not source code.

`dist/`

This is the built frontend output generated by `vite build`. It contains:

- `dist/index.html`
- Bundled JavaScript under `dist/assets/`

These are generated artifacts and can be recreated.

`node_modules/`

This folder contains installed JavaScript dependencies such as React, Vite, Babel-related packages, and other tooling dependencies. It is vendor code, not handwritten project logic.

`scripts/__pycache__/`

Compiled Python bytecode cache generated automatically by Python. It is not source code.

`.cache/`

Created by the backend at runtime to store supplement-analysis cache results. This avoids rerunning Python analysis unnecessarily when the profile and ingestion logic have not changed.

### Editor / Workspace File

`src/DESIGN PROJECT.code-workspace`

This is a VS Code workspace file. It is editor configuration metadata rather than application logic.

## Current Architecture Summary

If you want to understand the project quickly, these are the core files to read in order:

1. `src/App.jsx`
2. `src/medicalApi.js`
3. `server.js`
4. `scripts/lab_ingestion.py`
5. `scripts/supplement_recommender.py`
6. `medical-profile.json`

That sequence shows the full path from UI input to stored data to Python analysis and back to the frontend.

## Notes About Source Of Truth

- The current main frontend is the React app in `src/`.
- The older HTML/JS implementation still exists as `E1.html` + `app.js`.
- The medical and contact data source of truth is stored in local JSON files.
- The analysis feature depends on `historyRecords` being tagged with test-related labels such as `blood-test` or `lipid-test`.

## Suggested Future README Improvements

If you keep evolving this project, the next useful additions would be:

- A screenshot section for each tab
- A JSON schema example for `medical-profile.json`
- An API endpoint reference with request/response examples
- A short note explaining whether `E1.html` is still meant to be used or only kept for backup/reference
