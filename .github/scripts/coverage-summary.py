"""JaCoCo CSV raporundan GitHub çalıştırma özeti: toplam ve en düşük kapsamlı paketler."""

import csv
import sys

sys.stdout.reconfigure(encoding="utf-8")

rows = list(csv.DictReader(open(sys.argv[1], encoding="utf-8")))


def ratio(counter, items):
    covered = sum(int(r[counter + "_COVERED"]) for r in items)
    total = covered + sum(int(r[counter + "_MISSED"]) for r in items)
    return covered, total


print("## Backend test kapsamı\n")
print("| Ölçü | Kapsam | Kapsanan / toplam |")
print("|---|---|---|")
for counter, label in [("LINE", "Satır"), ("BRANCH", "Dal"), ("METHOD", "Metot")]:
    covered, total = ratio(counter, rows)
    print(f"| {label} | %{100 * covered / total:.1f} | {covered} / {total} |")

packages = {}
for r in rows:
    packages.setdefault(r["PACKAGE"].removeprefix("org.ece.blackrose."), []).append(r)
print("\n### En düşük satır kapsamı (paket)\n")
print("| Paket | Satır kapsamı | Eksik satır |")
print("|---|---|---|")
ranked = sorted(packages.items(), key=lambda p: ratio("LINE", p[1])[0] / max(ratio("LINE", p[1])[1], 1))
for name, items in ranked[:8]:
    covered, total = ratio("LINE", items)
    print(f"| {name} | %{100 * covered / total:.1f} | {total - covered} |")
