# MoonForest creature audio R1

New wolf, fox, boar and bear cues plus an original alpha-wolf battle score.
The current bear, Elena and map themes are retained with their own credits.

All inputs, generators and the editable MIDI/score are physically in this
directory, registered as `creature-audio-r1`. New effects and instruments use
original oscillators, resonators and seeded noise, without existing recordings,
commercial music, hosted AI generation or third-party SoundFont samples.

Optional authoring dependencies: Python 3, NumPy, SciPy, FFmpeg. On Ubuntu these
are public distribution packages `python3-numpy python3-scipy ffmpeg`. They are
not required to build or run the already prepared game.

From the project root, with the authoring dependencies installed:

```
python3 Sources/audio/creatures-2026-11-17/make_creatures.py
python3 Sources/audio/creatures-2026-11-17/compose_alpha.py
node ArcherPreview/scripts/prepare-creature-audio-r1.mjs
```

The game reads `audio-creatures-r1.json` only in release 0.2. The base audio
manifest, previous raw recordings, frozen 0.1 deployment and shared resource
bundle graph are preserved. Source WAVs/MIDI are authoring originals; hashed
WAV/MP3 files and the additive manifest are the runtime inputs.

Checks describe numerical clipping, file formats, loop continuity and routing.
They are not a claim of listener approval, real-device FPS or immunity from
automated copyright matching. See CREDITS.txt for the new/retained distinction.
