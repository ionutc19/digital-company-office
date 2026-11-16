#!/usr/bin/env python3
"""Generate the original Digital Company hero spritesheets.

Every character is drawn procedurally from simple shapes (no third-party art,
no copyrighted characters). Output layout matches the SkyOffice sheets used by
CharacterAnims: one row of 52 frames, 32x48 each:

  0-5 idle right, 6-11 idle up, 12-17 idle left, 18-23 idle down,
  24-29 run right, 30-35 run up, 36-41 run left, 42-47 run down,
  48 sit down, 49 sit left, 50 sit right, 51 sit up.

Usage: python3 tools/generate_hero_sprites.py [--preview out.png]
Requires Pillow. Writes client/public/assets/character/hero-<id>.png
"""
import argparse
import os

from PIL import Image

W, H = 32, 48
OUTLINE = (38, 34, 56, 255)
SKIN = (255, 204, 170, 255)
SKIN_SHADE = (236, 168, 140, 255)
WHITE = (250, 250, 250, 255)
EYE = (40, 36, 60, 255)

EMBLEMS = {
    'star': ['..#..', '.###.', '#####', '.#.#.', '#...#'],
    'bulb': ['.###.', '#####', '#####', '.###.', '..#..'],
    'coin': ['.###.', '#.#.#', '##.##', '#.#.#', '.###.'],
    'shield': ['#####', '#####', '#####', '.###.', '..#..'],
    'chevron': ['#...#', '##.##', '.###.', '..#..', '.....'],
    'cloud': ['.....', '.##..', '#####', '#####', '.....'],
    'bolt': ['..##.', '.##..', '####.', '..##.', '.##..'],
    'lock': ['.###.', '.#.#.', '#####', '##.##', '#####'],
    'cube': ['.###.', '#####', '#.#.#', '#.#.#', '.###.'],
    'gear': ['#.#.#', '.###.', '##.##', '.###.', '#.#.#'],
    'check': ['....#', '...##', '#.##.', '###..', '.#...'],
}


def rgba(hex_color):
    h = hex_color.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def shade(c, f=0.72):
    return (int(c[0] * f), int(c[1] * f), int(c[2] * f), 255)


# Original costumes, themed by role. Codenames are only names.
HEROES = {
    'john': dict(suit='#2d3e8c', accent='#f2c230', cape='#c8323c', hair='#2a2228', style='short', face='none', emblem='star'),
    'alakazam': dict(suit='#7a3fb0', accent='#ffd84a', cape=None, hair='#8a5a34', style='short', face='visor', gear='#59e0ff', emblem='bulb'),
    'piccolo': dict(suit='#2f8a4a', accent='#f4f4f4', cape='#f0f0f0', hair='#2f8a4a', style='bald', face='headband', gear='#f4f4f4', emblem='coin'),
    'bulma': dict(suit='#1f9a9a', accent='#ff7fb0', cape=None, hair='#a8432e', style='long', face='none', emblem='shield'),
    'goku': dict(suit='#a3232f', accent='#cfd6e0', cape='#1e1e2a', hair='#cfd6e0', style='helmet', face='none', emblem='chevron'),
    'charizard': dict(suit='#3f8fe0', accent='#ffffff', cape=None, hair='#ff8a2a', style='spiky', face='none', emblem='cloud'),
    'pikachu': dict(suit='#f2c81e', accent='#262630', cape=None, hair='#6b4423', style='short', face='mask', gear='#262630', emblem='bolt'),
    'gengar': dict(suit='#4b2f73', accent='#a6f04a', cape='#2b1c45', hair='#2b1c45', style='hood', face='mask', gear='#141020', emblem='lock'),
    'machamp': dict(suit='#6d7682', accent='#ff8a2a', cape=None, hair='#3a3030', style='buzz', face='none', emblem='cube'),
    'porygon': dict(suit='#c23a8e', accent='#4fe3f0', cape=None, hair='#1e2a3a', style='spiky', face='goggles', gear='#4fe3f0', emblem='gear'),
    'psyduck': dict(suit='#e8a02a', accent='#22305e', cape='#22305e', hair='#5a3a22', style='curly', face='glasses', gear='#22305e', emblem='check'),
}


class Canvas:
    def __init__(self):
        self.img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        self.px = self.img.load()

    def put(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.px[x, y] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, c)

    def ellipse(self, x0, y0, x1, y1, c, only=None):
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        rx, ry = (x1 - x0) / 2 + 0.5, (y1 - y0) / 2 + 0.5
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0 and (only is None or only(x, y)):
                    self.put(x, y, c)

    def outline(self):
        src = self.img.copy().load()
        for y in range(H):
            for x in range(W):
                if src[x, y][3]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and src[nx, ny][3] and src[nx, ny] != OUTLINE:
                        self.px[x, y] = OUTLINE
                        break


def draw_emblem(cv, name, cx, cy, color):
    for j, row in enumerate(EMBLEMS[name]):
        for i, ch in enumerate(row):
            if ch == '#':
                cv.put(cx - 2 + i, cy - 2 + j, color)


def draw_hair_front(cv, h, hair, top):
    style = h['style']
    if style == 'bald':
        return
    if style == 'helmet':
        cv.ellipse(6, top - 1, 25, top + 13, hair)
        cv.rect(6, top + 8, 25, top + 10, shade(hair))
        cv.rect(14, top - 3, 17, top, hair)  # crest
        return
    if style == 'hood':
        cv.ellipse(5, top - 2, 26, top + 22, hair, only=lambda x, y: not (8 <= x <= 23 and y >= top + 7))
        return
    if style == 'spiky':
        cv.ellipse(7, top, 24, top + 9, hair)
        for i, sx in enumerate(range(7, 25, 4)):
            cv.rect(sx, top - 3 + (i % 2), sx + 1, top + 1, hair)
        return
    if style == 'buzz':
        cv.ellipse(8, top + 1, 23, top + 8, hair, only=lambda x, y: y <= top + 6)
        return
    if style == 'curly':
        for cx in range(8, 24, 3):
            cv.ellipse(cx - 2, top, cx + 2, top + 5, hair)
        cv.ellipse(7, top + 2, 24, top + 9, hair, only=lambda x, y: y <= top + 6)
        return
    # short / long
    cv.ellipse(6, top, 25, top + 11, hair, only=lambda x, y: y <= top + 7 or x <= 8 or x >= 23)
    if style == 'long':
        cv.rect(6, top + 6, 8, top + 22, hair)
        cv.rect(23, top + 6, 25, top + 22, hair)


def draw_face_front(cv, h, top):
    face = h['face']
    ey = top + 12
    gear = rgba(h.get('gear', '#000000'))
    if face == 'mask':
        cv.rect(8, ey - 1, 23, ey + 2, gear)
        cv.rect(11, ey, 12, ey + 1, WHITE)
        cv.rect(19, ey, 20, ey + 1, WHITE)
        return
    if face == 'visor':
        cv.rect(9, ey - 1, 22, ey + 1, gear)
        cv.rect(10, ey - 1, 13, ey - 1, WHITE)
        return
    if face == 'goggles':
        cv.rect(7, ey - 1, 24, ey - 1, shade(gear, 0.5))
        cv.rect(10, ey - 2, 13, ey + 1, gear)
        cv.rect(18, ey - 2, 21, ey + 1, gear)
        cv.put(11, ey - 1, WHITE)
        cv.put(19, ey - 1, WHITE)
        return
    cv.rect(11, ey, 12, ey + 2, EYE)
    cv.rect(19, ey, 20, ey + 2, EYE)
    if face == 'glasses':
        for x0 in (10, 18):
            cv.rect(x0, ey - 1, x0 + 3, ey - 1, gear)
            cv.rect(x0, ey + 3, x0 + 3, ey + 3, gear)
            cv.rect(x0, ey - 1, x0, ey + 3, gear)
            cv.rect(x0 + 3, ey - 1, x0 + 3, ey + 3, gear)
        cv.rect(14, ey, 17, ey, gear)
    if face == 'headband':
        cv.rect(7, top + 6, 24, top + 7, gear)
    cv.rect(9, ey + 4, 10, ey + 4, SKIN_SHADE)
    cv.rect(21, ey + 4, 22, ey + 4, SKIN_SHADE)


def legs_front(cv, suit, boots, by, phase, sitting):
    if sitting:
        cv.rect(11, by + 11, 20, by + 14, suit)
        cv.rect(11, by + 15, 14, by + 16, boots)
        cv.rect(17, by + 15, 20, by + 16, boots)
        return
    lift_l = 2 if phase == 1 else 0
    lift_r = 2 if phase == 3 else 0
    cv.rect(11, by + 11, 14, by + 18 - lift_l, suit)
    cv.rect(17, by + 11, 20, by + 18 - lift_r, suit)
    cv.rect(11, by + 18 - lift_l, 14, by + 20 - lift_l, boots)
    cv.rect(17, by + 18 - lift_r, 20, by + 20 - lift_r, boots)


def frame_front(h, bob=0, phase=0, sitting=False, back=False, cape_wave=0):
    cv = Canvas()
    suit, accent, hair = rgba(h['suit']), rgba(h['accent']), rgba(h['hair'])
    top = 3 + bob
    by = 24 + bob  # torso top
    if h['cape']:
        cape = rgba(h['cape'])
        bottom = by + (14 if sitting else 19) + cape_wave
        if back:
            cv.rect(8, by, 23, bottom, cape)
            cv.rect(8, bottom - 1, 23, bottom, shade(cape))
        else:
            cv.rect(6, by + 1, 25, bottom - 2, shade(cape))
    swing = {0: 0, 1: -1, 2: 0, 3: 1}[phase] if not sitting else 0
    # arms
    cv.rect(7, by + 1 + swing, 9, by + 8 + swing, suit)
    cv.rect(22, by + 1 - swing, 24, by + 8 - swing, suit)
    cv.rect(7, by + 8 + swing, 9, by + 9 + swing, accent)
    cv.rect(22, by + 8 - swing, 24, by + 9 - swing, accent)
    legs_front(cv, suit, accent, by, phase, sitting)
    # torso
    cv.rect(10, by, 21, by + 10, suit)
    cv.rect(10, by + 9, 21, by + 10, accent)  # belt
    if back and h['cape']:
        cape = rgba(h['cape'])
        cv.rect(10, by, 21, by + 8, cape)
    elif not back:
        draw_emblem(cv, h['emblem'], 15, by + 4, accent)
    # head
    cv.ellipse(7, top + 3, 24, top + 21, SKIN)
    if back:
        if h['style'] == 'bald':
            cv.ellipse(7, top + 3, 24, top + 21, SKIN_SHADE, only=lambda x, y: y > top + 18)
        elif h['style'] == 'helmet':
            cv.ellipse(6, top - 1, 25, top + 18, hair)
            cv.rect(14, top - 3, 17, top, hair)
        else:
            cv.ellipse(6, top, 25, top + 21, hair)
            if h['style'] == 'long':
                cv.rect(8, top + 14, 23, top + 26, hair)
            if h['style'] == 'spiky':
                for i, sx in enumerate(range(7, 25, 4)):
                    cv.rect(sx, top - 3 + (i % 2), sx + 1, top + 1, hair)
        if h['face'] == 'headband':
            cv.rect(7, top + 6, 24, top + 7, rgba(h['gear']))
            cv.rect(15, top + 8, 16, top + 11, rgba(h['gear']))
    else:
        draw_hair_front(cv, h, hair, top)
        draw_face_front(cv, h, top)
    cv.outline()
    return cv.img


def frame_side_left(h, bob=0, phase=0, sitting=False, cape_wave=0):
    """Profile facing left; right-facing frames are mirrored."""
    cv = Canvas()
    suit, accent, hair = rgba(h['suit']), rgba(h['accent']), rgba(h['hair'])
    top = 3 + bob
    by = 24 + bob
    if h['cape']:
        cape = rgba(h['cape'])
        bottom = by + (13 if sitting else 18) + cape_wave
        cv.rect(17, by, 23 + (1 if phase in (1, 3) else 0), bottom, cape)
        cv.rect(17, bottom - 1, 23, bottom, shade(cape))
    # legs
    if sitting:
        cv.rect(8, by + 10, 19, by + 13, suit)
        cv.rect(8, by + 13, 11, by + 16, suit)
        cv.rect(6, by + 16, 11, by + 17, accent)
    else:
        stride = {0: 0, 1: 2, 2: 0, 3: -2}[phase]
        cv.rect(13 + stride, by + 10, 16 + stride, by + 18, shade(suit))
        cv.rect(12 + stride, by + 18, 16 + stride, by + 20, shade(accent))
        cv.rect(15 - stride, by + 10, 18 - stride, by + 18, suit)
        cv.rect(14 - stride, by + 18, 18 - stride, by + 20, accent)
    # torso
    cv.rect(11, by, 20, by + 10, suit)
    cv.rect(11, by + 9, 20, by + 10, accent)
    cv.rect(11, by + 2, 12, by + 6, accent)  # chest edge of emblem in profile
    # arm (swings with the stride)
    swing = 0 if sitting else {0: 0, 1: -2, 2: 0, 3: 2}[phase]
    cv.rect(14 + swing, by + 1, 17 + swing, by + 8, shade(suit, 0.85))
    cv.rect(14 + swing, by + 8, 17 + swing, by + 9, accent)
    # head
    cv.ellipse(8, top + 3, 23, top + 21, SKIN)
    style = h['style']
    if style == 'helmet':
        cv.ellipse(7, top - 1, 24, top + 13, hair, only=lambda x, y: x >= 10 or y <= top + 6)
        cv.rect(16, top - 3, 19, top, hair)
    elif style == 'hood':
        cv.ellipse(6, top - 2, 25, top + 22, hair, only=lambda x, y: not (x <= 15 and y >= top + 7))
    elif style != 'bald':
        cv.ellipse(9, top, 24, top + 12, hair, only=lambda x, y: y <= top + 6 or x >= 15)
        if style == 'long':
            cv.rect(17, top + 10, 23, top + 24, hair)
        if style == 'spiky':
            for i, sx in enumerate(range(11, 25, 4)):
                cv.rect(sx, top - 3 + (i % 2), sx + 1, top + 1, hair)
        if style == 'curly':
            for cx in range(11, 24, 3):
                cv.ellipse(cx - 2, top, cx + 2, top + 5, hair)
    # face details (left side)
    ey = top + 12
    face = h['face']
    gear = rgba(h.get('gear', '#000000'))
    if face == 'mask':
        cv.rect(8, ey - 1, 16, ey + 2, gear)
        cv.rect(10, ey, 11, ey + 1, WHITE)
    elif face == 'visor':
        cv.rect(8, ey - 1, 14, ey + 1, gear)
    elif face == 'goggles':
        cv.rect(9, ey - 2, 12, ey + 1, gear)
        cv.rect(12, ey - 1, 23, ey - 1, shade(gear, 0.5))
    else:
        cv.rect(10, ey, 11, ey + 2, EYE)
        if face == 'glasses':
            cv.rect(9, ey - 1, 12, ey - 1, gear)
            cv.rect(9, ey + 3, 12, ey + 3, gear)
            cv.rect(12, ey - 1, 19, ey - 1, gear)
        if face == 'headband':
            cv.rect(8, top + 6, 23, top + 7, gear)
            cv.rect(22, top + 8, 24, top + 11, gear)
    cv.rect(9, ey + 4, 10, ey + 4, SKIN_SHADE)
    cv.outline()
    return cv.img


def build_sheet(h):
    sheet = Image.new('RGBA', (W * 52, H), (0, 0, 0, 0))
    frames = []
    idle_bob = [0, 0, 1, 1, 1, 0]
    wave = [0, 0, 1, 1, 0, 0]
    run_phase = [0, 1, 1, 2, 3, 3]
    run_bob = [0, 1, 0, 0, 1, 0]
    left = lambda **k: frame_side_left(h, **k)
    right = lambda **k: frame_side_left(h, **k).transpose(Image.FLIP_LEFT_RIGHT)
    front = lambda **k: frame_front(h, **k)
    back = lambda **k: frame_front(h, back=True, **k)
    for maker in (right, back, left, front):
        frames += [maker(bob=idle_bob[i], cape_wave=wave[i]) for i in range(6)]
    for maker in (right, back, left, front):
        frames += [maker(bob=run_bob[i], phase=run_phase[i], cape_wave=1 - wave[i]) for i in range(6)]
    frames += [front(sitting=True), left(sitting=True), right(sitting=True), back(sitting=True)]
    assert len(frames) == 52
    for i, f in enumerate(frames):
        sheet.paste(f, (i * W, 0), f)
    return sheet


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'client', 'public', 'assets', 'character'))
    ap.add_argument('--preview', help='write an enlarged preview of key frames for every hero')
    args = ap.parse_args()
    sheets = {}
    for hid, h in HEROES.items():
        sheets[hid] = build_sheet(h)
        sheets[hid].save(os.path.join(args.out, f'hero-{hid}.png'), optimize=True)
    if args.preview:
        keys = [18, 0, 12, 6, 42, 26, 48, 49]
        prev = Image.new('RGBA', (W * len(keys), H * len(sheets)), (70, 70, 80, 255))
        for r, s in enumerate(sheets.values()):
            for c, k in enumerate(keys):
                f = s.crop((k * W, 0, k * W + W, H))
                prev.paste(f, (c * W, r * H), f)
        prev.resize((prev.width * 4, prev.height * 4), Image.NEAREST).save(args.preview)
    print(f'wrote {len(sheets)} hero sheets')


if __name__ == '__main__':
    main()
