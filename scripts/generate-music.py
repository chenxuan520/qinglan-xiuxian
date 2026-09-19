"""Compose an original pentatonic loop. Requires Python 3, numpy and macOS afconvert."""

from pathlib import Path
import subprocess
import tempfile
import wave

import numpy as np

RATE = 44100
BEAT = 60 / 72
BARS = 24
FRAMES = round(BARS * 4 * BEAT * RATE)
rng = np.random.default_rng(20260920)
mix = np.zeros((FRAMES, 2), dtype=np.float64)


def add(signal, beat, gain, pan=0):
    """Wrap note/reverb tails into the start so the composition loops continuously."""
    offset = round(beat * BEAT * RATE)
    stereo = signal[:, None] * gain * np.sqrt([(1 - pan) / 2, (1 + pan) / 2])
    indices = (np.arange(len(signal)) + offset) % FRAMES
    mix[indices] += stereo


def pluck(note, beats=3):
    t = np.arange(round(beats * BEAT * RATE)) / RATE
    frequency = 440 * 2 ** ((note - 69) / 12)
    signal = np.zeros_like(t)
    # Inharmonic, progressively shorter partials approximate a soft zither string.
    for harmonic in range(1, 11):
        partial = frequency * harmonic * np.sqrt(1 + 0.00012 * harmonic**2)
        signal += (
            np.sin(2 * np.pi * partial * t)
            * np.exp(-t * (0.95 + harmonic * 0.42))
            / harmonic**1.35
        )
    signal += rng.normal(0, 0.03, len(t)) * np.exp(-t * 95)
    return signal * (1 - np.exp(-t * 260)) * np.minimum(1, (t[-1] - t) / 0.04)


def flute(note, beats):
    duration = beats * BEAT
    t = np.arange(round(duration * RATE)) / RATE
    frequency = 440 * 2 ** ((note - 69) / 12)
    vibrato = 1 + 0.0025 * np.sin(2 * np.pi * 4.7 * t) * (1 - np.exp(-t * 3))
    phase = 2 * np.pi * frequency * np.cumsum(vibrato) / RATE
    breath = np.convolve(rng.normal(0, 0.04, len(t)), np.ones(12) / 12, mode="same")
    signal = np.sin(phase) + 0.19 * np.sin(2 * phase) + 0.055 * np.sin(3 * phase) + breath
    envelope = np.minimum(1, t / 0.16) * np.minimum(1, (duration - t) / 0.24)
    return signal * envelope * (0.88 + 0.12 * np.sin(np.pi * t / duration))


def pad(notes):
    duration = BEAT * 5.5
    t = np.arange(round(duration * RATE)) / RATE
    signal = np.zeros_like(t)
    for note in notes:
        frequency = 440 * 2 ** ((note - 69) / 12)
        signal += np.sin(2 * np.pi * frequency * t) + 0.3 * np.sin(2 * np.pi * frequency * 1.002 * t)
    envelope = np.minimum(1, t / 1.3) * np.minimum(1, (duration - t) / 1.8)
    return signal * envelope / len(notes)


# D major pentatonic: D E F# A B. Eight-bar call, answer, then a quiet return.
chords = [(50, 57, 66), (47, 54, 62), (43, 50, 59), (45, 52, 62)]
phrases = [
    [(0, 74, 1.5), (2, 78, 1.5), (4, 81, 2.5), (7, 78, 0.7)],
    [(0, 76, 1.5), (2, 74, 2.7), (5.5, 71, 1.8)],
    [(0, 74, 1), (1.5, 76, 1), (3, 78, 2), (6, 81, 1.6)],
    [(0, 78, 2.5), (3.5, 76, 1.5), (6, 74, 1.6)],
    [(0, 81, 1.5), (2, 83, 1), (3.5, 86, 2.5), (6.5, 83, 1)],
    [(0, 81, 2), (3, 78, 2), (6, 76, 1.5)],
    [(0, 78, 1.5), (2, 81, 2), (5, 78, 1), (6.5, 76, 1)],
    [(0, 74, 3), (4.5, 71, 2.5)],
    [(0, 74, 2), (3, 78, 2), (6, 76, 1.5)],
    [(0, 71, 2), (3, 69, 3)],
    [(0, 71, 1.5), (2, 74, 1.5), (4, 76, 2.5)],
    [(0, 78, 2), (3, 76, 1.5), (5.5, 74, 2)],
]

for bar in range(BARS):
    chord = chords[bar % 4]
    add(pad(chord[:2]), bar * 4, 0.035, 0.1)
    for index, position in enumerate([0, 1.5, 2.5, 3.5]):
        note = chord[[0, 2, 1, 2][index]] + (12 if index == 3 else 0)
        add(pluck(note), bar * 4 + position, 0.16 if index == 0 else 0.11, -0.3)
    if bar % 4 == 3:
        for step, note in enumerate([74, 76, 78]):
            add(pluck(note, 2), bar * 4 + 3 + step * 0.25, 0.035, 0.45)

for phrase, notes in enumerate(phrases):
    for beat, note, length in notes:
        add(flute(note, length), phrase * 8 + beat, 0.10, 0.25)

# Short stereo reflections and diffuse tails; circular delay preserves the loop.
dry = mix.copy()
for delay, gain in [(0.13, 0.16), (0.29, 0.12), (0.47, 0.09), (0.73, 0.06), (1.13, 0.04)]:
    mix += np.roll(dry[:, ::-1], round(delay * RATE), axis=0) * gain
mix -= mix.mean(axis=0)
mix *= 0.72 / np.max(np.abs(mix))
pcm = np.round(mix * 32767).astype("<i2")
output = Path(__file__).resolve().parents[1] / "public/assets/audio/qinglan-mist.m4a"
output.parent.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory() as directory:
    source = Path(directory) / "qinglan-mist.wav"
    with wave.open(str(source), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(pcm.tobytes())
    subprocess.run(["afconvert", str(source), str(output), "-f", "m4af", "-d", "aac", "-b", "96000", "-q", "127"], check=True)
print(f"{output.name}: {FRAMES / RATE:.1f}s, {output.stat().st_size:,} bytes, peak {np.max(np.abs(mix)):.2f}, RMS {np.sqrt(np.mean(mix**2)):.3f}")
