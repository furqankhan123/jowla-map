#!/usr/bin/env python3
"""Regenerates icons/*.png (needs Pillow): python tools/make-icons.py
Design: blue tile, white map pin, dotted route with a start dot. Maskable and apple-touch
variants are full bleed (the OS applies the mask); content stays inside the 80% safe zone."""
import os
from PIL import Image, ImageDraw

BLUE = (26, 115, 232, 255)
DARK = (13, 71, 161, 255)
WHITE = (255, 255, 255, 255)
SS = 4  # supersampling factor
OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')


def draw_icon(size, rounded, scale):
    n = size * SS
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=BLUE)
    else:
        d.rectangle([0, 0, n, n], fill=BLUE)
    c = n / 2
    u = n * scale / 100.0  # unit: content spans 100 units, centered

    def P(x, y):  # content coords (0-100) -> pixels
        return (c + (x - 50) * u, c + (y - 50) * u)

    # route: dotted path from lower-left start dot up to the pin
    route = [(18, 84), (28, 76), (40, 80), (52, 72), (60, 66)]
    for (x, y) in route[1:]:
        px, py = P(x, y)
        r = 2.6 * u
        d.ellipse([px - r, py - r, px + r, py + r], fill=WHITE)
    sx, sy = P(*route[0])
    r = 5.2 * u
    d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=WHITE)
    d.ellipse([sx - r * 0.45, sy - r * 0.45, sx + r * 0.45, sy + r * 0.45], fill=DARK)

    # pin: circle head + pointed tip
    hx, hy = P(60, 34)
    hr = 22 * u
    tipx, tipy = P(60, 66)
    d.polygon([(hx - hr * 0.86, hy + hr * 0.5), (hx + hr * 0.86, hy + hr * 0.5), (tipx, tipy)], fill=WHITE)
    d.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=WHITE)
    ir = 9 * u
    d.ellipse([hx - ir, hy - ir, hx + ir, hy + ir], fill=BLUE)

    return img.resize((size, size), Image.LANCZOS)


def save(name, size, rounded, scale):
    draw_icon(size, rounded, scale).save(os.path.join(OUT, name))
    print('wrote', name)


os.makedirs(OUT, exist_ok=True)
save('icon-192.png', 192, True, 0.72)
save('icon-512.png', 512, True, 0.72)
save('icon-512-maskable.png', 512, False, 0.56)   # content within the central ~60% safe zone
save('apple-touch-icon.png', 180, False, 0.66)
