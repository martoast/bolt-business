#!/usr/bin/env python3
"""Build the animated connection-arc layer for the hero.

Coordinates are in the hero image's own pixel space (2560x1040). The <svg> uses
that as its viewBox with preserveAspectRatio="xMidYMid slice", which crops
exactly the way `background-size: cover; background-position: center center`
does - so every arc stays glued to its city no matter the viewport.
"""
import math, json, sys

W, H = 2560, 1040

NODES = {
    # mapped from the previous frame through the known crop, then
    # nudged onto the nearest light (26px)
    "SEA": (1312, 405), "LAX": (1194, 449), "TIJ": (1288, 694),
    "CHI": (1765, 472), "NYC": (2026, 454), "ATL": (1882, 557),
    "HOU": (1614, 622), "MIA": (1966, 630), "GDL": (1547, 851),
    "MEX": (1602, 861), "CUB": (2148, 776), "PAN": (1761, 855),
    "BOG": (2262, 948), "EUR": (2500, 110), "PAC": (760, 760),
    "NOR": (1100, 300),
}

# (from, to, lift, seconds, delay, accent)
ARCS = [
    ("MEX", "NYC", 0.42,  4.5, 0.0,  False),
    ("LAX", "NYC", 0.50, 6.3, 1.2,  False),
    ("MEX", "LAX", 0.40,  4.0, 2.4,  True),
    ("TIJ", "CHI", 0.46,  5.4, 0.6,  False),
    ("HOU", "MIA", 0.38,  4.0, 3.1,  False),
    ("MEX", "PAN", 0.34,  4.0, 1.8,  False),
    ("CHI", "MIA", 0.40,  4.2, 4.2,  False),
    ("NYC", "EUR", 0.30,  5.1, 0.9,  True),
    ("SEA", "CHI", 0.42,  4.5, 5.0,  False),
    ("MEX", "CUB", 0.40,  4.8, 2.9,  False),
    ("PAN", "BOG", 0.38,  4.0, 4.6,  False),
    ("GDL", "HOU", 0.38,  4.0, 5.6,  False),
    ("SEA", "NYC", 0.54, 6.6, 3.6,  False),
    ("ATL", "CUB", 0.34,  4.0, 6.3,  True),
    ("LAX", "PAC", 0.30,  5.7, 2.0,  False),
    ("SEA", "NOR", 0.26,  4.8, 6.8,  False),
    ("MEX", "PAC", 0.34, 6.0, 4.9,  False),
]

def path_d(a, b, lift):
    (x1, y1), (x2, y2) = NODES[a], NODES[b]
    d = math.hypot(x2 - x1, y2 - y1)
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2 - d * lift   # bow away from the planet
    return f"M{x1},{y1} Q{cx:.0f},{cy:.0f} {x2},{y2}"

def build():
    out = [
        f'<svg class="bolt-arcs" viewBox="0 0 {W} {H}" '
        'preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
    ]
    # static rails first, so every pulse runs over a visible line
    out.append('<g class="bolt-arcs__rails">')
    for a, b, lift, *_ in ARCS:
        out.append(f'<path d="{path_d(a,b,lift)}"/>')
    out.append('</g>')

    # the travelling light itself: a wide soft pass under a bright core
    out.append('<g class="bolt-arcs__pulses">')
    for a, b, lift, dur, delay, accent in ARCS:
        d = path_d(a, b, lift)
        cls = "is-accent" if accent else ""
        style = f'--d:{dur}s;--t:{delay}s'
        out.append(f'<path class="bolt-arcs__glow {cls}" style="{style}" pathLength="1" d="{d}"/>')
        out.append(f'<path class="bolt-arcs__core {cls}" style="{style}" pathLength="1" d="{d}"/>')
    out.append('</g>')

    # city dots, one per node actually used
    used = sorted({n for a, b, *_ in ARCS for n in (a, b)} - {"EUR"})
    out.append('<g class="bolt-arcs__nodes">')
    for i, n in enumerate(used):
        x, y = NODES[n]
        out.append(f'<circle class="bolt-arcs__halo" style="--t:{i*0.47:.2f}s" cx="{x}" cy="{y}" r="9"/>')
        out.append(f'<circle class="bolt-arcs__dot" cx="{x}" cy="{y}" r="2.6"/>')
    out.append('</g>')
    out.append('</svg>')
    return "".join(out)

if __name__ == "__main__":
    svg = build()
    open(sys.argv[1], "w", encoding="utf-8").write(svg)
    print(f"{len(ARCS)} arcs, {len(svg)} bytes -> {sys.argv[1]}")
