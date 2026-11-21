"""Generate the original textured teaching block. Requires Pillow."""
import base64
import io
import json
import math
import random
import struct
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw

output = Path(__file__).resolve().parents[1] / "assets"
rng = random.Random(174)
geometry = defaultdict(lambda: ([], [], [], []))
materials = []
textures = []
part = "roads-main"


def color(rgb):
    materials.append({"pbrMetallicRoughness": {
        "baseColorFactor": [*(value / 255 for value in rgb), 1],
        "metallicFactor": 0, "roughnessFactor": .9,
    }, "doubleSided": True})
    return len(materials) - 1


def textured(image):
    file = io.BytesIO()
    image.save(file, "JPEG", quality=91)
    textures.append(file.getvalue())
    materials.append({"pbrMetallicRoughness": {
        "baseColorTexture": {"index": len(textures) - 1},
        "metallicFactor": 0, "roughnessFactor": .94,
    }, "doubleSided": True})
    return len(materials) - 1


def grain(rgb):
    image = Image.new("RGB", (192, 192))
    pixels = []
    for _ in range(192 * 192):
        noise = rng.randint(-9, 9)
        pixels.append(tuple(max(0, min(255, channel + noise)) for channel in rgb))
    image.putdata(pixels)
    return image


with Image.open(output / "facade-atlas.webp") as atlas:
    facades = [textured(atlas.crop((left, top, left + 512, top + 512)).resize((384, 384), Image.Resampling.LANCZOS))
               for top in (0, 512) for left in (0, 512)]

asphalt = grain((69, 72, 72))
wear = ImageDraw.Draw(asphalt, "RGBA")
for _ in range(72):
    x, y = rng.randrange(192), rng.randrange(192)
    wear.line((x, y, x + rng.randint(0, 5), y + rng.randint(0, 3)), fill=(165, 160, 151, rng.randint(9, 35)))
road = textured(asphalt)
pavers = grain((158, 155, 145))
seams = ImageDraw.Draw(pavers, "RGBA")
for y in range(0, 193, 32):
    seams.line((0, y, 192, y), fill=(88, 83, 74, 70))
    for x in range((y // 32 % 2) * 16, 193, 32):
        seams.line((x, y, x, y + 32), fill=(88, 83, 74, 65))
curb = textured(pavers)
roofs = [textured(grain(rgb)) for rgb in [(122, 127, 119), (114, 113, 107), (145, 133, 111), (153, 151, 135)]]
grass = textured(grain((94, 113, 63)))
earth = textured(grain((106, 115, 83)))
white = color((236, 226, 199))
yellow = color((217, 181, 88))
metal = color((105, 116, 113))
tree_bark = color((100, 81, 57))
leaves = [textured(grain(rgb)) for rgb in [(62, 93, 52), (77, 106, 60), (88, 113, 62), (53, 77, 45)]]


def quad(mat, coords, u=1, v=1, vertex_normals=None):
    positions, normals, tex, indices = geometry[part, mat]
    a, b, c = coords[:3]
    ab = tuple(y - x for x, y in zip(a, b))
    ac = tuple(y - x for x, y in zip(a, c))
    cross = (ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0])
    length = math.sqrt(sum(x * x for x in cross))
    normal = tuple(x / length for x in cross)
    start = len(positions) // 3
    for index, point in enumerate(coords):
        positions.extend(point)
        normals.extend(vertex_normals[index] if vertex_normals else normal)
    tex.extend([0, v, u, v, u, 0, 0, 0])
    indices.extend(start + offset for offset in [0, 1, 2, 0, 2, 3])


def plane(mat, x, north, width, depth, height=0, repeat=12):
    left, right = x - width / 2, x + width / 2
    front, back = -north + depth / 2, -north - depth / 2
    quad(mat, [(left, height, front), (right, height, front), (right, height, back), (left, height, back)],
         width / repeat, depth / repeat)


def box(wall, top, x, north, w, d, height, base=0, wall_repeat=(7, 6)):
    left, right = x - w / 2, x + w / 2
    front, back = -north + d / 2, -north - d / 2
    roof = height + base
    for (a, b), size in [
        (((left, front), (right, front)), w), (((right, front), (right, back)), d),
        (((right, back), (left, back)), w), (((left, back), (left, front)), d),
    ]:
        quad(wall, [(a[0], base, a[1]), (b[0], base, b[1]), (b[0], roof, b[1]), (a[0], roof, a[1])],
             max(1, round(size / wall_repeat[0])), max(1, round(height / wall_repeat[1])))
    plane(top, x, north, w, d, roof)


def leaves_cluster(x, north, scale, offset=0):
    sides = 12
    rings = [(.33, 2.7), (1.62, 3.35), (2.1, 4.75), (1.55, 6.10), (.50, 6.72), (.11, 6.82)]
    angles = [side * math.tau / sides for side in range(sides + 1)]
    variation = [rng.uniform(.84, 1.16) for _ in range(sides)]
    material = rng.choice(leaves)

    def point(i, radius, level):
        angle = angles[i]
        radius *= variation[i % sides] * scale
        return x + radius * math.cos(angle), offset + level * scale, -north + radius * math.sin(angle)

    def normal(i, radius, level):
        direction = (radius * math.cos(angles[i]), (level - 4.76) * .85, radius * math.sin(angles[i]))
        length = math.sqrt(sum(value * value for value in direction))
        return tuple(value / length for value in direction)

    for (lower, bottom), (upper, top) in zip(rings, rings[1:]):
        for side in range(sides):
            corners = [(side + 1, lower, bottom), (side, lower, bottom),
                       (side, upper, top), (side + 1, upper, top)]
            quad(material, [point(*corner) for corner in corners], vertex_normals=[normal(*corner) for corner in corners])


def tree(x, north, scale):
    global part
    previous = part
    part = "greenery"
    box(tree_bark, tree_bark, x, north, .32 * scale, .32 * scale, 3.8 * scale)
    leaves_cluster(x, north, scale)
    if scale > .85:
        side = rng.choice((-1, 1))
        leaves_cluster(x + side * 1.4 * scale, north + .65 * scale, scale * .69, 1.65 * scale)
    part = previous


part = "land"
plane(earth, 0, 0, 428, 360, -.12, 10)
part = "roads-main"
plane(road, 0, 0, 414, 20, .02)
plane(road, 0, 0, 18, 356, .025)
part = "roads-side"
for n in (-106, 106):
    plane(road, 0, n, 414, 12, .03)
for x in (-129, 129):
    plane(road, x, 0, 12, 356, .035)

part = "roads-main"
for x in range(-198, 205, 11):
    if min(abs(x), abs(x - 129), abs(x + 129)) > 15:
        plane(yellow, x, 0, 4, .18, .065)
        for n in (-3.4, 3.4):
            plane(white, x, n, 4, .14, .061)
for n in range(-168, 170, 10):
    if min(abs(n), abs(n - 106), abs(n + 106)) > 14:
        plane(yellow, 0, n, .17, 3.8, .07)
        for x in (-3.1, 3.1):
            plane(white, x, n, .14, 3.8, .066)
for trim in (-8.8, 8.8):
    plane(white, 0, trim, 414, .13, .047)
for offset in range(-7, 8, 2):
    for x in (-14, 14):
        plane(white, x, offset, 3, .81, .072)
    for n in (-15, 15):
        plane(white, offset, n, .81, 3, .072)

blocks = [(-169, 62, 62, 83), (-69, 57, 106, 83), (69, 57, 106, 83), (168, 58, 64, 84),
          (-170, -58, 62, 83), (-69, -57, 106, 83), (69, -57, 106, 83), (170, -58, 63, 83),
          (-171, 139, 61, 49), (-69, 139, 106, 49), (69, 139, 106, 49), (170, 139, 63, 49),
          (-171, -139, 61, 49), (-69, -139, 106, 49), (69, -139, 106, 49), (170, -139, 63, 49)]
for i, (x, n, w, d) in enumerate(blocks):
    part = "land"
    plane(curb, x, n, w, d, .28)
    plane(grass, x, n, w - 7, d - 7, .31)
    if i in (3, 5):
        plane(curb, x, n, 4.5, d - 4, .34)
        plane(curb, x, n, w - 4, 3.5, .34)
        for px in (-w / 3, w / 3):
            for pn in (-d / 3, -d / 7, d / 5, d / 3):
                tree(x + px + rng.uniform(-4, 4), n + pn, rng.uniform(.85, 1.24))
        continue
    part = "buildings"
    columns = 3 if w > 80 else 2
    rows = 2 if d > 60 else 1
    for col in range(columns):
        for row in range(rows):
            bx = x + (col - (columns - 1) / 2) * (w / columns)
            bn = n + (row - (rows - 1) / 2) * (d / rows)
            bw = min(w / columns - 6, rng.randint(17, 26))
            bd = min(d / rows - 7, rng.randint(21, 30))
            height = rng.randint(9, 42) if i < 8 else rng.randint(9, 27)
            wall, roof = rng.choice(facades), rng.choice(roofs)
            if i == 2 and col == 1 and row == 0:
                bx, bn, bw, bd, height, wall = 69, 43, 22, 27, 26, facades[1]
            box(wall, roof, bx, bn, bw, bd, height, .32)
            if height >= 15:
                for px, pn in [(bx, bn - bd / 2 + .2), (bx, bn + bd / 2 - .2)]:
                    box(roof, roof, px, pn, bw - .15, .38, .7, height + .32)
                for px in (bx - bw / 2 + .2, bx + bw / 2 - .2):
                    box(roof, roof, px, bn, .38, bd - .2, .7, height + .32)
            box(roof, metal, bx + bw * .21, bn + bd * .13, bw * .31, bd * .27, rng.uniform(1, 3), height + .32)
            if height >= 28:
                box(wall, roof, bx, bn, bw * .69, bd * .67, rng.uniform(2.4, 6.4), height + .32)
    part = "land"
    for offset in range(round(-w / 2 + 7), round(w / 2 - 3), 12):
        tree(x + offset, n + (-d / 2 + 3.4 if n > 0 else d / 2 - 3.4), rng.uniform(.73, 1.07))

binary = bytearray()
views, accessors, primitives = [], [], []


def append(data, target=None):
    while len(binary) % 4:
        binary.append(0)
    item = {"buffer": 0, "byteOffset": len(binary), "byteLength": len(data)}
    if target:
        item["target"] = target
    binary.extend(data)
    views.append(item)
    return len(views) - 1


def accessor(values, fmt, shape, components, target, bounds=False):
    view = append(struct.pack(f"<{len(values)}{fmt}", *values), target)
    item = {"bufferView": view, "componentType": 5126 if fmt == "f" else 5125,
            "count": len(values) // components, "type": shape}
    if bounds:
        item["min"] = [min(values[i::components]) for i in range(components)]
        item["max"] = [max(values[i::components]) for i in range(components)]
    accessors.append(item)
    return len(accessors) - 1


for (name, mat), (pos, normal, uv, idx) in geometry.items():
    primitives.append({
        "extras": {"layer": name}, "material": mat, "indices": accessor(idx, "I", "SCALAR", 1, 34963),
        "attributes": {
            "POSITION": accessor(pos, "f", "VEC3", 3, 34962, True),
            "NORMAL": accessor(normal, "f", "VEC3", 3, 34962),
            "TEXCOORD_0": accessor(uv, "f", "VEC2", 2, 34962),
        },
    })
images = [{"bufferView": append(texture), "mimeType": "image/jpeg"} for texture in textures]
model = {"asset": {"version": "2.0", "generator": "Digital City Lab original synthetic streetscape"},
         "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}], "meshes": [{"primitives": primitives}],
         "materials": materials, "images": images, "textures": [{"source": i} for i in range(len(images))],
         "buffers": [{"byteLength": len(binary)}], "bufferViews": views, "accessors": accessors}
blob = json.dumps(model, separators=(",", ":")).encode()
blob += b" " * (-len(blob) % 4)
binary += b"\0" * (-len(binary) % 4)
output.mkdir(parents=True, exist_ok=True)
glb = (
    struct.pack("<4sII", b"glTF", 2, 28 + len(blob) + len(binary))
    + struct.pack("<I4s", len(blob), b"JSON") + blob
    + struct.pack("<I4s", len(binary), b"BIN\0") + binary
)

(output / "city-model.js").write_text('globalThis.CITY_MODEL = "' + base64.b64encode(glb).decode() + '";\n')
