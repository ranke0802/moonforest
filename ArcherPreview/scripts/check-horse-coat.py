"""Run with Python, ModernGL, NumPy and Pillow on a machine with desktop OpenGL.
Exercises the shipping coat shader on the actual textured horse without a browser.
"""
import io
import json
from pathlib import Path
import struct
import subprocess

import moderngl
import numpy as np
from PIL import Image


PROJECT = Path(__file__).resolve().parents[1]
HORSE = PROJECT / "src/v03/models/wagon-horse-rig.glb"


def mesh_and_atlas():
    glb = HORSE.read_bytes()
    json_length = struct.unpack_from("<I", glb, 12)[0]
    model = json.loads(glb[20:20 + json_length])
    binary = glb[28 + json_length:]

    def view(index):
        block = model["bufferViews"][index]
        start = block.get("byteOffset", 0)
        return binary[start:start + block["byteLength"]]

    def attribute(index):
        data = model["accessors"][index]
        block = model["bufferViews"][data["bufferView"]]
        kind = np.dtype({5123: "<u2", 5125: "<u4", 5126: "<f4"}[data["componentType"]])
        columns = {"VEC3": 3, "VEC2": 2, "SCALAR": 1}[data["type"]]
        stride = block.get("byteStride", columns * kind.itemsize)
        return np.ndarray((data["count"], columns), dtype=kind, buffer=view(data["bufferView"]),
                          offset=data.get("byteOffset", 0), strides=(stride, kind.itemsize))

    body = next(node for node in model["nodes"] if node["name"] == "wagon_horse")
    primitive = model["meshes"][body["mesh"]]["primitives"][0]
    material = model["materials"][primitive["material"]]["pbrMetallicRoughness"]
    source = model["textures"][material["baseColorTexture"]["index"]]["source"]
    atlas = Image.open(io.BytesIO(view(model["images"][source]["bufferView"]))).convert("RGB")
    attrs = primitive["attributes"]
    vertices = np.column_stack((attribute(attrs["POSITION"]), attribute(attrs["TEXCOORD_0"])))
    return vertices.astype("f4"), attribute(primitive["indices"]).astype("u4"), atlas


def test_coat():
    ctx = moderngl.create_standalone_context()
    node = """import {HorseCoat} from './src/v03/horse-coat.js';
    console.log(JSON.stringify(['vertex','fragment'].map(t=>HorseCoat.prototype.getCustomCode(t))));"""
    vertex, fragment = json.loads(subprocess.check_output(
        ["node", "--input-type=module", "-e", node], cwd=PROJECT))
    program = ctx.program(
        vertex_shader=("#version 330\nin vec3 position; in vec2 uv; out vec2 texCoord; "
                       "uniform float side; " + vertex["CUSTOM_VERTEX_DEFINITIONS"].replace("varying", "out") +
                       "void main(){" + vertex["CUSTOM_VERTEX_MAIN_BEGIN"] +
                       "texCoord=uv; gl_Position=vec4(position.z/51.,position.y/45.-1.,"
                       "-side*position.x/25.,1.);}"),
        fragment_shader=("#version 330\nin vec2 texCoord; out vec4 color; "
                         "uniform sampler2D atlas; uniform vec4 horseCoat; " +
                         fragment["CUSTOM_FRAGMENT_DEFINITIONS"].replace("varying", "in") +
                         "void main(){vec3 surfaceAlbedo=texture(atlas,texCoord).rgb;" +
                         fragment["CUSTOM_FRAGMENT_UPDATE_ALBEDO"] +
                         "color=vec4(pow(surfaceAlbedo,vec3(1./2.2)),1.);}"))

    vertices, indices, image = mesh_and_atlas()
    texture = ctx.texture(image.size, 3, image.tobytes(), alignment=1, internal_format=0x8C41)  # GL_SRGB8
    texture.build_mipmaps()
    texture.use(0)
    program["atlas"] = 0
    vao = ctx.vertex_array(program, [(ctx.buffer(vertices.tobytes()), "3f 2f", "position", "uv")],
                           ctx.buffer(indices.tobytes()), index_element_size=4)
    width, height = 1020, 900
    target = ctx.simple_framebuffer((width, height))
    target.use()
    ctx.enable(moderngl.DEPTH_TEST)

    def render(side, coat):
        target.clear(0, 0, 0, 0)
        program["side"] = side
        program["horseCoat"] = coat
        vao.render()
        return np.frombuffer(target.read(components=3, alignment=1), dtype=np.uint8).reshape(height, width, 3)

    # All landmarks use the unanimated GLB profile (forward Z, up Y).
    landmarks = {"eye": (39.6, 75.65), "upper brass ring": (33.88, 74.9),
                 "lower brass ring": (40.4, 67.3), "crown strap": (32.56, 79.35),
                 "cheek strap": (36.8, 72.2), "noseband": (42.8, 69.1),
                 "fore hoof": (19.3, 2.1), "hind hoof": (-33.3, 2.3)}

    def sample(frame, landmark):
        z, y = landmark
        return frame[round(y * 10), round((z + 51) * 10)].astype(int)

    for side in [-1, 1]:
        original = render(side, (0, 0, 0, 0))
        for tint in [(0, 0, 0), (.2195,) * 3, (1, .8913, .627)]:
            painted = render(side, (*tint, 1))
            for name, where in landmarks.items():
                before, after = sample(original, where), sample(painted, where)
                assert before.max() > 8, (name, "empty sample")
                assert np.max(np.abs(after - before)) <= 3, (name, before, after)
            flank = sample(painted, (0, 51))
            tail = sample(painted, (-44.5, 34.5))
            assert np.max(np.abs(flank - sample(original, (0, 51)))) > 15
            assert tail.mean() < flank.mean() * .8, (tail, flank)
            if side == -1:
                mane = sample(painted, (18, 72))
                assert mane.mean() < flank.mean() * .8, (mane, flank)
            if tint == (0, 0, 0):
                body = painted[470:605, 380:610, 0]
                assert 40 < np.median(body) < 85, "Black coat lost its midtones"
                assert np.quantile(body, .95) - np.quantile(body, .05) >= 4, "Flank shading went flat"
    print("Both sides, three coats, eyes, brass, leather, hooves, hair and black midtones passed on",
          ctx.info["GL_RENDERER"])


if __name__ == "__main__":
    test_coat()
