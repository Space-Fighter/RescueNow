import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

TEST_TAGS = {"lipid-test", "blood-test", "cbc", "sugar-test", "thyroid-test"}

METRIC_ALIASES: dict[str, list[str]] = {
    "total_cholesterol": ["total cholesterol", "cholesterol total", "cholesterol"],
    "ldl": ["ldl", "ldl cholesterol", "ldl-c"],
    "hdl": ["hdl", "hdl cholesterol", "hdl-c"],
    "triglycerides": ["triglycerides", "triglyceride", "tg"],
    "fasting_glucose": ["fasting blood sugar", "fasting glucose", "fbs", "glucose fasting"],
    "hba1c": ["hba1c", "glycated hemoglobin"],
    "hemoglobin": ["hemoglobin", "haemoglobin", "hb"],
}

METRIC_LABELS = {
    "total_cholesterol": "Total Cholesterol",
    "ldl": "LDL",
    "hdl": "HDL",
    "triglycerides": "Triglycerides",
    "fasting_glucose": "Fasting Glucose",
    "hba1c": "HbA1c",
    "hemoglobin": "Hemoglobin",
}

PLAUSIBLE_RANGES: dict[str, tuple[float, float]] = {
    "total_cholesterol": (70.0, 450.0),
    "ldl": (20.0, 350.0),
    "hdl": (10.0, 120.0),
    "triglycerides": (20.0, 1200.0),
    "fasting_glucose": (40.0, 500.0),
    "hba1c": (3.0, 20.0),
    "hemoglobin": (5.0, 25.0),
}


class LabMeasurement(BaseModel):
    metric_key: str = Field(description="Normalized metric key")
    label: str = Field(description="Human-readable metric name")
    value: float = Field(description="Measured numeric value")
    unit: str = Field(default="", description="Value unit if available")
    raw_line: str = Field(default="", description="Original source line")


class LabReportIngestion(BaseModel):
    report_title: str = ""
    report_date: str = ""
    source_file: str = ""
    parser_used: str = Field(default="none", description="llamaparse|pypdf|plain-text|none")
    measurements: list[LabMeasurement] = Field(default_factory=list)


def parse_iso_date(value: str):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_date_token(token: str):
    token = token.strip()

    # 2026-04-12
    m = re.search(r"\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b", token)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return datetime(y, mo, d)
        except ValueError:
            return None

    # 12/04/2026 or 12-04-26 (assume day-first first, then month-first fallback)
    m = re.search(r"\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b", token)
    if m:
        a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        for d, mo in ((a, b), (b, a)):
            try:
                return datetime(y, mo, d)
            except ValueError:
                continue

    # 12 Apr 2026 / 12 April 2026
    for fmt in ("%d %b %Y", "%d %B %Y", "%b %d %Y", "%B %d %Y", "%d %b, %Y", "%d %B, %Y", "%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(token, fmt)
        except ValueError:
            continue

    return None


def _find_dates_in_line(line: str):
    patterns = [
        r"\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b",
        r"\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b",
        r"\b\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{4}\b",
        r"\b[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}\b",
    ]

    dates = []
    for pattern in patterns:
        for token in re.findall(pattern, line):
            parsed = _parse_date_token(token)
            if parsed:
                dates.append(parsed)
    return dates


def extract_report_date(text: str, title: str, uploaded_at: str) -> str:
    # Prefer lines that likely refer to report timestamps.
    priority_keywords = [
        "report date",
        "reported on",
        "report generated",
        "reporting date",
        "date of report",
        "collection date",
        "sample collected",
        "collected on",
        "collected",
        "specimen collected",
        "test date",
        "registered on",
        "drawn on",
    ]

    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]

    priority_candidates = []
    generic_candidates = []
    all_candidates = []

    for line in lines:
        found_dates = _find_dates_in_line(line)
        if not found_dates:
            continue
        all_candidates.extend(found_dates)

        lowered = line.lower()
        if any(keyword in lowered for keyword in priority_keywords):
            priority_candidates.extend(found_dates)
        elif "date" in lowered:
            generic_candidates.extend(found_dates)

    title_candidates = _find_dates_in_line(title or "")
    all_candidates.extend(title_candidates)

    now = datetime.now()
    plausible_recent = [d for d in all_candidates if 2015 <= d.year <= (now.year + 1)]

    chosen = None
    if priority_candidates:
        chosen = max(priority_candidates)
    elif generic_candidates:
        chosen = max(generic_candidates)
    elif plausible_recent:
        chosen = max(plausible_recent)
    elif title_candidates:
        chosen = max(title_candidates)

    if chosen:
        return chosen.strftime("%Y-%m-%d")

    uploaded_dt = parse_iso_date(uploaded_at)
    if uploaded_dt:
        return uploaded_dt.strftime("%Y-%m-%d")

    return ""


def _extract_with_llamaparse(file_path: Path) -> str:
    # LlamaParse is optional at runtime but preferred for PDF ingestion.
    from llama_parse import LlamaParse  # type: ignore

    parser = LlamaParse(
        result_type="markdown",
        parsing_instruction=(
            "Extract lab report text preserving rows with test-name, value, unit, and reference range."
        ),
    )
    docs = parser.load_data(str(file_path))
    chunks = [getattr(doc, "text", "") for doc in docs]
    return "\n".join(chunk for chunk in chunks if chunk)


def should_use_llamaparse() -> bool:
    key = str(os.getenv("LLAMA_CLOUD_API_KEY", "")).strip()
    if not key:
        return False
    if key.startswith("llx-fake"):
        return False
    return True


def _extract_with_pypdf(file_path: Path) -> str:
    import pypdf  # type: ignore

    reader = pypdf.PdfReader(str(file_path))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def read_text_from_file(file_path: Path, mime_type: str) -> tuple[str, str]:
    if not file_path.exists() or not file_path.is_file():
        return "", "none"

    suffix = file_path.suffix.lower()

    if suffix in {".txt", ".csv", ".log", ".md"} or mime_type.startswith("text/"):
        try:
            return file_path.read_text(encoding="utf-8", errors="ignore"), "plain-text"
        except OSError:
            return "", "none"

    if suffix == ".pdf":
        if should_use_llamaparse():
            try:
                return _extract_with_llamaparse(file_path), "llamaparse"
            except Exception:
                pass
        try:
            return _extract_with_pypdf(file_path), "pypdf"
        except Exception:
            return "", "none"

    return "", "none"


def parse_measurements_from_text(text: str) -> list[LabMeasurement]:
    if not text:
        return []

    lowered = text.lower()
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    line_set = lines if lines else lowered.split(".")

    measurements: dict[str, LabMeasurement] = {}

    def is_plausible(metric_key: str, value: float) -> bool:
        low, high = PLAUSIBLE_RANGES.get(metric_key, (-1e9, 1e9))
        return low <= value <= high

    for key, aliases in METRIC_ALIASES.items():
        for alias in aliases:
            line_match = None
            for line in line_set:
                if alias in line.lower():
                    line_match = line
                    break

            if line_match:
                # Capture common lab row pattern: metric ... value unit
                match = re.search(
                    r"([-+]?\d+(?:\.\d+)?)\s*(mg/dl|g/dl|mmol/l|%|mg/l)?",
                    line_match,
                    flags=re.IGNORECASE,
                )
                if match:
                    value = float(match.group(1))
                    unit = (match.group(2) or "").strip()
                    if not is_plausible(key, value):
                        continue
                    measurements[key] = LabMeasurement(
                        metric_key=key,
                        label=METRIC_LABELS[key],
                        value=value,
                        unit=unit,
                        raw_line=line_match,
                    )
                    break

            # Fallback on full-text pattern if line scan fails.
            alias_pattern = re.escape(alias)
            match = re.search(
                rf"{alias_pattern}[^\d\n]{{0,24}}([-+]?\d+(?:\.\d+)?)\s*(mg/dl|g/dl|mmol/l|%|mg/l)?",
                lowered,
                flags=re.IGNORECASE,
            )
            if match:
                value = float(match.group(1))
                unit = (match.group(2) or "").strip()
                if not is_plausible(key, value):
                    continue
                measurements[key] = LabMeasurement(
                    metric_key=key,
                    label=METRIC_LABELS[key],
                    value=value,
                    unit=unit,
                    raw_line=match.group(0),
                )
                break

    return list(measurements.values())


def ingest_lab_report(
    title: str,
    uploaded_at: str,
    file_name: str,
    file_path: str,
    mime_type: str,
    notes: str,
    files_root: Path,
) -> LabReportIngestion:
    absolute = (files_root / file_path).resolve() if file_path else Path("")
    extracted_text, parser_used = read_text_from_file(absolute, mime_type) if file_path else ("", "none")

    combined_text = "\n".join(
        [
            title or "",
            notes or "",
            file_name or "",
            extracted_text or "",
        ]
    )

    report_date = extract_report_date(combined_text, title or file_name, uploaded_at)
    measurements = parse_measurements_from_text(combined_text)

    return LabReportIngestion(
        report_title=title or file_name,
        report_date=report_date,
        source_file=file_path,
        parser_used=parser_used,
        measurements=measurements,
    )


def load_profile(profile_path: Path) -> dict[str, Any]:
    with profile_path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else {}


def build_test_records(profile_path: Path, files_root: Path):
    profile = load_profile(profile_path)
    records = profile.get("historyRecords", []) if isinstance(profile, dict) else []
    test_records = []

    for record in records:
        if not isinstance(record, dict):
            continue

        tags = [str(t).strip().lower() for t in record.get("tags", []) if str(t).strip()]
        if not any(tag in TEST_TAGS for tag in tags):
            continue

        uploaded_at = str(record.get("uploadedAt", ""))
        date_obj = parse_iso_date(uploaded_at)

        ingestion = ingest_lab_report(
            title=str(record.get("title", "")),
            uploaded_at=uploaded_at,
            file_name=str(record.get("fileName", "")),
            file_path=str(record.get("filePath", "")).strip(),
            mime_type=str(record.get("mimeType", "application/octet-stream")),
            notes=str(record.get("notes", "")),
            files_root=files_root,
        )

        metrics = {m.metric_key: m.value for m in ingestion.measurements}

        test_records.append(
            {
                "id": str(record.get("id", "")),
                "title": ingestion.report_title,
                "reportDate": ingestion.report_date,
                "uploadedAt": uploaded_at,
                "tags": tags,
                "metrics": metrics,
                "parserUsed": ingestion.parser_used,
                "structuredMeasurements": [m.model_dump() for m in ingestion.measurements],
                "sortDate": ingestion.report_date or (date_obj.isoformat() if date_obj else ""),
            }
        )

    test_records.sort(key=lambda r: r.get("sortDate") or "")
    return profile, test_records


def build_chart_series(test_records):
    series = {key: [] for key in METRIC_LABELS.keys()}

    for record in test_records:
        for metric, value in record.get("metrics", {}).items():
            if metric not in series:
                continue
            series[metric].append(
                {
                    "date": record.get("reportDate") or record.get("uploadedAt") or "Unknown",
                    "value": value,
                    "title": record.get("title") or "Record",
                }
            )

    return {
        metric: {
            "label": METRIC_LABELS[metric],
            "points": points,
        }
        for metric, points in series.items()
        if points
    }
