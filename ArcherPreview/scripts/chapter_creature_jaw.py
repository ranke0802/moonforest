"""Apply the painted jaw binding on two chapter goblins in bind-mesh vertex order."""
import hashlib
import json
from functools import lru_cache
from pathlib import Path

import numpy as np


@lru_cache(maxsize=1)
def _brushes():
    return json.loads(Path(__file__).with_name('chapter-creature-jaw-masks.json').read_text('utf-8'))


def bind_chapter_jaw(kind, raw_positions, joint_names, joint_ids, weights):
    """Skull-rigid at the lips and tusks, feathered under the jaw into the original neck."""
    brush = _brushes().get(kind)
    if brush is None:
        return joint_ids, weights
    digest = hashlib.sha256(raw_positions.astype('<f4', copy=False).tobytes()).hexdigest()
    if len(raw_positions) != brush['vertexCount'] or digest != brush['positionSha256']:
        raise ValueError(f'{kind}: jaw brush belongs to a different bind mesh')
    head = joint_names.index('Head')
    output_ids, output_weights = joint_ids.copy(), weights.copy()
    for i, opacity in brush['rows']:
        slots = np.flatnonzero(output_ids[i] == head)
        if slots.size:
            head_slot = slots[0]
        else:
            # This point has four other influences. Preserve their relative proportions
            # across the three retained slots and put the head in the weakest slot.
            head_slot = np.argmin(output_weights[i])
            output_ids[i, head_slot] = head
            output_weights[i, head_slot] = 0
            output_weights[i] /= output_weights[i].sum()
        blend = opacity / 255.0
        output_weights[i] *= 1.0 - blend
        output_weights[i, head_slot] += blend
    return output_ids, output_weights
