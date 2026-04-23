import json
import os
import sys
from pathlib import Path
from urllib import error, request

from analysis_cache import (
    build_profile_analysis_hash,
    load_cached_analysis,
    save_analysis_to_cache,
)
from lab_ingestion import build_chart_series, build_test_records


def call_openai(profile, test_records, api_key: str):
    compact_records = [
        {
            "title": record.get("title"),
            "uploadedAt": record.get("uploadedAt"),
            "tags": record.get("tags"),
            "metrics": record.get("metrics"),
        }
        for record in test_records
    ]

    payload = {
        "model": "gpt-4.1-mini",
        "temperature": 0.2,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a cautious medical assistant. Provide wellness-oriented supplement and routine suggestions "
                    "from blood/lipid trends. Do not diagnose. Mention that doctor confirmation is required. "
                    "Return strict JSON with keys: supplements, routines, caution, summary."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "patient": profile.get("patient", {}),
                        "conditions": profile.get("patient", {}).get("conditions", []),
                        "allergies": profile.get("patient", {}).get("allergies", []),
                        "history": compact_records,
                    }
                ),
            },
        ],
        "response_format": {"type": "json_object"},
    }

    req = request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        parsed = json.loads(content)
        return parsed, None
    except (error.URLError, error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError) as exc:
        return None, str(exc)


def fallback_recommendations(test_records):
    latest_metrics = {}
    if test_records:
        latest_metrics = test_records[-1].get("metrics", {})

    supplements = []
    routines = [
        "Follow a Mediterranean-style diet with vegetables, legumes, whole grains, and healthy fats.",
        "Aim for 150 minutes/week of moderate cardio and 2 resistance sessions.",
        "Sleep 7-8 hours and maintain a fixed wake/sleep schedule.",
    ]
    caution = [
        "These suggestions are educational and must be reviewed by your physician.",
        "Avoid starting supplements that may conflict with existing medicines or allergies.",
    ]

    total_chol = latest_metrics.get("total_cholesterol")
    ldl = latest_metrics.get("ldl")
    hdl = latest_metrics.get("hdl")
    tg = latest_metrics.get("triglycerides")

    if total_chol and total_chol > 200 or (ldl and ldl > 130):
        supplements.append("Omega-3 (EPA/DHA) may support lipid balance.")
        supplements.append("Psyllium husk (soluble fiber) can help reduce LDL over time.")
        routines.append("Reduce saturated fats and increase daily fiber intake to 25-35g.")

    if tg and tg > 150:
        supplements.append("Discuss prescription-strength omega-3 with your doctor for high triglycerides.")
        routines.append("Cut down sugary beverages and refined carbs.")

    if hdl and hdl < 40:
        routines.append("Add brisk walking or cycling most days to improve HDL profile.")

    if not supplements:
        supplements = [
            "No targeted supplement inferred from current extracted values.",
            "Continue physician-advised medications and periodic blood testing.",
        ]

    return {
        "supplements": supplements,
        "routines": routines,
        "caution": caution,
        "summary": "Auto-generated from available blood/lipid entries without full lab report parsing.",
    }


def to_string_list(value):
    if isinstance(value, list):
        result = []
        for item in value:
            if isinstance(item, str):
                text = item.strip()
                if text:
                    result.append(text)
                continue
            if isinstance(item, dict):
                name = str(item.get("name", "")).strip()
                desc = str(item.get("reason") or item.get("description") or item.get("note") or "").strip()
                if name and desc:
                    result.append(f"{name}: {desc}")
                elif name:
                    result.append(name)
                elif desc:
                    result.append(desc)
                continue
            text = str(item).strip()
            if text:
                result.append(text)
        return result

    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []

    if isinstance(value, dict):
        return [json.dumps(value)]

    return []


def normalize_recommendations(recs):
    if not isinstance(recs, dict):
        recs = {}
    return {
        "supplements": to_string_list(recs.get("supplements")),
        "routines": to_string_list(recs.get("routines")),
        "caution": to_string_list(recs.get("caution")),
        "summary": str(recs.get("summary", "")).strip(),
    }


def build_analysis_result(profile_path: Path, root_path: Path):
    profile, test_records = build_test_records(profile_path, root_path)
    chart_series = build_chart_series(test_records)

    api_key = os.getenv("OPENAI_API_KEY", "")
    api_enabled = bool(api_key and not api_key.startswith("sk-fake"))

    ai_result = None
    api_error = None
    if api_enabled:
        ai_result, api_error = call_openai(profile, test_records, api_key)

    recommendations = normalize_recommendations(ai_result if ai_result else fallback_recommendations(test_records))

    return profile, {
        "recordsConsidered": len(test_records),
        "recommendations": {
            "supplements": recommendations["supplements"],
            "routines": recommendations["routines"],
            "caution": recommendations["caution"],
            "summary": recommendations["summary"],
        },
        "chartSeries": chart_series,
        "parsersUsed": sorted({record.get("parserUsed", "none") for record in test_records}),
        "apiUsed": bool(ai_result),
        "apiError": api_error,
    }


def generate_analysis(profile_path: Path, root_path: Path, cache_path: Path | None = None):
    cache_file = cache_path or (root_path / "analysis_cache.json")
    profile, _ = build_test_records(profile_path, root_path)
    file_hash = build_profile_analysis_hash(profile, root_path)

    cached = load_cached_analysis(file_hash, cache_file)
    if cached:
        return {
            **cached["analysis_result"],
            "cached": True,
            "cacheTimestamp": cached["timestamp"],
            "fileHash": file_hash,
        }

    _, result = build_analysis_result(profile_path, root_path)
    cached_payload = save_analysis_to_cache(file_hash, result, cache_file)

    return {
        **result,
        "cached": False,
        "cacheTimestamp": cached_payload["timestamp"],
        "fileHash": file_hash,
    }


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python supplement_recommender.py <profile_path> <root_path>"}))
        sys.exit(1)

    profile_path = Path(sys.argv[1]).resolve()
    root_path = Path(sys.argv[2]).resolve()

    if not profile_path.exists():
        print(json.dumps({"error": "medical-profile.json not found"}))
        sys.exit(1)

    print(json.dumps(generate_analysis(profile_path, root_path)))


if __name__ == "__main__":
    main()
