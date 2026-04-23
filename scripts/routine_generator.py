import json
import sys
from pathlib import Path

from supplement_recommender import generate_analysis


TYPE_ORDER = {
    "Exercise": 0,
    "Supplement": 1,
    "Study": 2,
    "Custom": 3,
}


def _minutes_to_hhmm(total_minutes: int) -> str:
    hours = max(0, total_minutes // 60) % 24
    minutes = max(0, total_minutes % 60)
    return f"{hours:02d}:{minutes:02d}"


def _classify_routine(name: str, description: str) -> str:
    text = f"{name} {description}".lower()
    if any(word in text for word in ["walk", "workout", "exercise", "cardio", "stretch", "yoga", "run", "cycling", "strength"]):
        return "Exercise"
    if "study" in text:
        return "Study"
    return "Custom"


def _supplement_slots(count: int) -> list[tuple[str, str]]:
    slots = [("08:30", "08:40"), ("13:00", "13:10"), ("20:30", "20:40"), ("21:00", "21:10"), ("21:30", "21:40")]
    if count <= len(slots):
        return slots[:count]

    extra = []
    start_minutes = 22 * 60
    for index in range(count - len(slots)):
        extra_start = start_minutes + (index * 15)
        extra.append((_minutes_to_hhmm(extra_start), _minutes_to_hhmm(extra_start + 10)))
    return slots + extra


def _build_supplement_routines(items: list[str]) -> list[dict]:
    routines = []
    for index, item in enumerate(items):
        name = item.split(":")[0].strip() if ":" in item else item.strip()
        start_time, end_time = _supplement_slots(len(items))[index]
        routines.append(
            {
                "id": f"ai-supplement-{index + 1}",
                "name": f"Take {name}" if not name.lower().startswith("take ") else name,
                "type": "Supplement",
                "startTime": start_time,
                "endTime": end_time,
                "description": item.strip(),
            }
        )
    return routines


def _build_lifestyle_routines(items: list[str], user_data: dict) -> list[dict]:
    default_start = user_data.get("preferredStartTime") or "06:30"
    base_hour, base_minute = [int(part) for part in default_start.split(":", 1)] if ":" in default_start else (6, 30)
    start_minutes = (base_hour * 60) + base_minute

    routines = []
    for index, item in enumerate(items):
        routine_type = _classify_routine(item, item)
        duration = 45 if routine_type == "Exercise" else 30
        current_start = start_minutes + (index * 60)
        routines.append(
            {
                "id": f"ai-routine-{index + 1}",
                "name": item.split(".")[0].strip()[:70] or f"Routine {index + 1}",
                "type": routine_type,
                "startTime": _minutes_to_hhmm(current_start),
                "endTime": _minutes_to_hhmm(current_start + duration),
                "description": item.strip(),
            }
        )
    return routines


def _baseline_day_routines(user_data: dict, medical_analysis: dict) -> list[dict]:
    patient = user_data.get("patient", {}) if isinstance(user_data, dict) else {}
    conditions = [str(item).strip().lower() for item in patient.get("conditions", []) if str(item).strip()]
    summary = str((medical_analysis.get("recommendations") or {}).get("summary", "")).lower()

    cardio_name = "Morning Exercise"
    cardio_description = "30-40 minutes of moderate exercise such as brisk walking, cycling, or light cardio."
    if "cholesterol" in summary or "triglyceride" in summary:
        cardio_name = "Morning Cardio Walk"
        cardio_description = "30-40 minutes of brisk walking or light cardio to support lipid balance."

    if any(flag in conditions for flag in {"injury", "arthritis", "joint pain"}):
        cardio_name = "Gentle Morning Walk"
        cardio_description = "20-30 minutes of gentle walking at a comfortable pace."

    return [
        {
            "id": "ai-sleep-1",
            "name": "Sleep",
            "type": "Custom",
            "startTime": "22:30",
            "endTime": "06:00",
            "description": "Aim for a consistent sleep window to support recovery, hormone balance, and energy.",
        },
        {
            "id": "ai-stretch-1",
            "name": "Morning Stretch",
            "type": "Exercise",
            "startTime": "06:10",
            "endTime": "06:25",
            "description": "Light stretching and mobility work to wake up the body and loosen stiff muscles.",
        },
        {
            "id": "ai-exercise-1",
            "name": cardio_name,
            "type": "Exercise",
            "startTime": "07:00",
            "endTime": "07:40",
            "description": cardio_description,
        },
        {
            "id": "ai-stretch-2",
            "name": "Evening Stretch",
            "type": "Exercise",
            "startTime": "21:15",
            "endTime": "21:30",
            "description": "Gentle stretching or breathing work to wind down before sleep.",
        },
    ]


def _default_exercise_routines(user_data: dict, medical_analysis: dict) -> list[dict]:
    patient = user_data.get("patient", {}) if isinstance(user_data, dict) else {}
    conditions = [str(item).strip().lower() for item in patient.get("conditions", []) if str(item).strip()]
    summary = str((medical_analysis.get("recommendations") or {}).get("summary", "")).lower()

    morning_name = "Morning Stretching"
    morning_description = "10-15 minutes of light stretching and mobility to start the day gently."
    evening_name = "Evening Walk"
    evening_description = "20-30 minutes of brisk walking to support circulation, stamina, and heart health."

    lower_intensity_flags = {"asthma", "injury", "arthritis", "joint pain"}
    if any(flag in conditions for flag in lower_intensity_flags) or "triglyceride" in summary or "cholesterol" in summary:
        evening_name = "Light Cardio Walk"
        evening_description = "20-30 minutes of light to moderate walking to support lipid balance and daily activity."

    return [
        {
            "id": "ai-exercise-1",
            "name": morning_name,
            "type": "Exercise",
            "startTime": "06:30",
            "endTime": "06:50",
            "description": morning_description,
        },
        {
            "id": "ai-exercise-2",
            "name": evening_name,
            "type": "Exercise",
            "startTime": "18:30",
            "endTime": "19:00",
            "description": evening_description,
        },
    ]


def _sort_key(item: dict):
    start = str(item.get("startTime", "23:59"))
    type_rank = TYPE_ORDER.get(str(item.get("type", "Custom")), 99)
    return (start, type_rank, str(item.get("name", "")).lower())


def generate_daily_routine(user_data, medical_analysis):
    recommendations = medical_analysis.get("recommendations", {}) if isinstance(medical_analysis, dict) else {}
    supplement_items = recommendations.get("supplements", []) if isinstance(recommendations, dict) else []
    routine_items = recommendations.get("routines", []) if isinstance(recommendations, dict) else []

    routines = _baseline_day_routines(user_data or {}, medical_analysis or {})
    routines.extend(_build_lifestyle_routines(list(s for s in routine_items if isinstance(s, str) and s.strip()), user_data or {}))
    if not any(item.get("type") == "Exercise" for item in routines):
        routines.extend(_default_exercise_routines(user_data or {}, medical_analysis or {}))
    routines.extend(_build_supplement_routines(list(s for s in supplement_items if isinstance(s, str) and s.strip())))

    normalized = []
    for index, routine in enumerate(sorted(routines, key=_sort_key)):
        normalized.append(
            {
                **routine,
                "position": index,
                "source": "ai",
            }
        )

    return {"routines": normalized}


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python routine_generator.py <profile_path> <root_path>"}))
        raise SystemExit(1)

    profile_path = Path(sys.argv[1]).resolve()
    root_path = Path(sys.argv[2]).resolve()

    try:
        user_data = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        user_data = {}

    medical_analysis = generate_analysis(profile_path, root_path)
    generated = generate_daily_routine(user_data, medical_analysis)

    print(
        json.dumps(
            {
                **generated,
                "analysis": medical_analysis,
            }
        )
    )


if __name__ == "__main__":
    main()
