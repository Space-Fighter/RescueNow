import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":"))


def generate_file_hash(files: Iterable[Any]) -> str:
    hasher = hashlib.sha256()

    for item in files:
        if isinstance(item, Path):
            path = item
            hasher.update(str(path).encode("utf-8"))
            if path.exists() and path.is_file():
                hasher.update(path.read_bytes())
            continue

        if isinstance(item, str):
            path = Path(item)
            if path.exists() and path.is_file():
                hasher.update(str(path).encode("utf-8"))
                hasher.update(path.read_bytes())
            else:
                hasher.update(item.encode("utf-8"))
            continue

        hasher.update(_stable_json(item).encode("utf-8"))

    return hasher.hexdigest()


def load_cached_analysis(file_hash: str, cache_path: Path) -> dict[str, Any] | None:
    try:
        payload = json.loads(cache_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    if not isinstance(payload, dict):
        return None

    if payload.get("file_hash") != file_hash:
        return None

    analysis_result = payload.get("analysis_result")
    if not isinstance(analysis_result, dict):
        return None

    return {
        "file_hash": file_hash,
        "analysis_result": analysis_result,
        "timestamp": str(payload.get("timestamp", "")),
    }


def save_analysis_to_cache(file_hash: str, result: dict[str, Any], cache_path: Path) -> dict[str, Any]:
    payload = {
        "file_hash": file_hash,
        "analysis_result": result,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    cache_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
    return payload


def build_profile_analysis_hash(profile: dict[str, Any], root_path: Path) -> str:
    tracked_inputs: list[Any] = []
    history_records = profile.get("historyRecords", []) if isinstance(profile, dict) else []

    for record in history_records:
        if not isinstance(record, dict):
            continue

        tracked_inputs.append(
          {
              "id": str(record.get("id", "")),
              "title": str(record.get("title", "")),
              "fileName": str(record.get("fileName", "")),
              "filePath": str(record.get("filePath", "")),
              "mimeType": str(record.get("mimeType", "")),
              "size": int(record.get("size", 0) or 0),
              "uploadedAt": str(record.get("uploadedAt", "")),
              "notes": str(record.get("notes", "")),
              "tags": sorted(str(tag).strip().lower() for tag in record.get("tags", []) if str(tag).strip()),
          }
        )

        file_path = str(record.get("filePath", "")).strip()
        if file_path:
            tracked_inputs.append((root_path / file_path).resolve())

    return generate_file_hash(tracked_inputs)
