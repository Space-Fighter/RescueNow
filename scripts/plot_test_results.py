import argparse
from pathlib import Path

import matplotlib.pyplot as plt

from lab_ingestion import METRIC_LABELS, build_test_records


def _to_dates(points):
    labels = []
    values = []
    for point in points:
        labels.append((point.get("date") or "")[:10] or "Unknown")
        values.append(float(point.get("value", 0)))
    return labels, values


def build_metric_points(test_records):
    metric_points: dict[str, list[dict]] = {key: [] for key in METRIC_LABELS}
    for record in test_records:
        for metric, value in record.get("metrics", {}).items():
            if metric not in metric_points:
                continue
            metric_points[metric].append(
                {
                    "date": record.get("reportDate") or record.get("uploadedAt"),
                    "value": value,
                    "title": record.get("title", "Record"),
                }
            )
    return {k: v for k, v in metric_points.items() if v}


def render_plot(profile_path: Path, root_path: Path, output_path: Path, show: bool):
    _, test_records = build_test_records(profile_path, root_path)
    metric_points = build_metric_points(test_records)

    if not metric_points:
        print("No chartable test values found in tagged blood/lipid records.")
        return 1

    rows = len(metric_points)
    fig, axes = plt.subplots(rows, 1, figsize=(11, max(3, rows * 2.5)), squeeze=False)
    fig.suptitle("Patient Blood/Lipid Test Trends", fontsize=14, fontweight="bold")

    for idx, (metric, points) in enumerate(metric_points.items()):
        ax = axes[idx][0]
        labels, values = _to_dates(points)
        ax.plot(labels, values, marker="o", linewidth=2, color="#dc2626")
        ax.set_title(METRIC_LABELS.get(metric, metric), fontsize=11, loc="left")
        ax.grid(alpha=0.25, linestyle="--")
        ax.tick_params(axis="x", rotation=30, labelsize=8)
        ax.tick_params(axis="y", labelsize=8)

    plt.tight_layout(rect=[0, 0, 1, 0.96])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=180)
    print(f"Saved graph to: {output_path}")

    if show:
        plt.show()

    return 0


def main():
    parser = argparse.ArgumentParser(description="Render blood/lipid trend graphs from medical profile history records.")
    parser.add_argument("profile_path", help="Path to medical-profile.json")
    parser.add_argument("root_path", help="Project root path")
    parser.add_argument(
        "--output",
        default="user_files/test-results-trends.png",
        help="Output image path for generated graph",
    )
    parser.add_argument("--show", action="store_true", help="Open matplotlib viewer after saving")

    args = parser.parse_args()
    code = render_plot(
        profile_path=Path(args.profile_path).resolve(),
        root_path=Path(args.root_path).resolve(),
        output_path=Path(args.output).resolve(),
        show=args.show,
    )
    raise SystemExit(code)


if __name__ == "__main__":
    main()
