#!/usr/bin/env python3
"""Génère les fichiers audio (MP3) des passages clés des thèmes.

Ces fichiers permettent l'écoute écran éteint / en arrière-plan sur téléphone,
ce que la synthèse vocale du navigateur ne permet pas.

Prérequis :
    pip install piper-tts
    ffmpeg
    voix Piper « fr_FR-siwis-medium » (licence CC-BY 4.0), téléchargée automatiquement
    depuis https://huggingface.co/rhasspy/piper-voices

Utilisation (après `npm run build`) :
    python3 tools/build_audio.py

Seuls les passages nouveaux ou modifiés sont générés.
Produit :
    audio/<livre>-<chap>-<debut>-<fin>.mp3      le texte du passage
    audio/ref/<livre>-<chap>-<debut>-<fin>.mp3  l'annonce de la référence
    audio/silence-<n>.mp3                       silences (pauses de méditation)
    data/audio.json                             liste des passages disponibles et durées
"""
import hashlib
import json
import subprocess
import sys
import urllib.request
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio"
CACHE = ROOT / "tools" / ".cache"
VOICE = "fr_FR-siwis-medium"
VOICE_URL = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/{VOICE}"
BITRATE = "40k"
LENGTH_SCALE = 1.08  # un peu plus lent que la normale : rythme de méditation
VERSE_GAP = 0.45  # secondes de silence entre deux versets d'un même passage
SILENCES = [1, 2, 3, 4, 8, 15, 30, 60]


def ensure_voice() -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    model = CACHE / f"{VOICE}.onnx"
    for suffix in (".onnx", ".onnx.json"):
        dest = CACHE / f"{VOICE}{suffix}"
        if not dest.exists():
            print(f"Téléchargement de la voix {dest.name}…")
            urllib.request.urlretrieve(VOICE_URL + suffix, dest)
    return model


def encode(pcm: bytes, rate: int, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", "-",
         "-c:a", "libmp3lame", "-b:a", BITRATE, "-id3v2_version", "0", str(dest)],
        input=pcm, check=True,
    )


def main() -> None:
    jobs = json.loads(subprocess.run(["node", str(ROOT / "tools" / "audio-jobs.mjs")],
                                     capture_output=True, check=True, text=True).stdout)
    from piper import PiperVoice, SynthesisConfig

    voice = PiperVoice.load(str(ensure_voice()))
    rate = voice.config.sample_rate
    cfg = SynthesisConfig(length_scale=LENGTH_SCALE)

    def synth(text: str) -> bytes:
        return b"".join(chunk.audio_int16_bytes for chunk in voice.synthesize(text, syn_config=cfg))

    manifest_path = ROOT / "data" / "audio.json"
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    old_items = old.get("items", {}) if old.get("voice") == VOICE else {}
    items = {}
    gap = b"\x00\x00" * int(rate * VERSE_GAP)

    for i, job in enumerate(jobs, 1):
        digest = hashlib.sha1(json.dumps([job["ref"], job["verses"], LENGTH_SCALE]).encode()).hexdigest()[:12]
        main_file = AUDIO / f"{job['key']}.mp3"
        ref_file = AUDIO / "ref" / f"{job['key']}.mp3"
        prev = old_items.get(job["key"])
        if prev and prev["h"] == digest and main_file.exists() and ref_file.exists():
            items[job["key"]] = prev
            continue
        pcm = gap.join(synth(v) for v in job["verses"])
        encode(pcm, rate, main_file)
        ref_pcm = synth(job["ref"])
        encode(ref_pcm, rate, ref_file)
        items[job["key"]] = {"h": digest, "d": round(len(pcm) / 2 / rate, 1), "r": round(len(ref_pcm) / 2 / rate, 1)}
        print(f"[{i}/{len(jobs)}] {job['key']} ({items[job['key']]['d']} s)")

    for n in SILENCES:
        f = AUDIO / f"silence-{n}.mp3"
        if not f.exists():
            encode(b"\x00\x00" * (rate * n), rate, f)

    # supprime les fichiers des passages retirés des thèmes
    for f in list(AUDIO.glob("*-*-*-*.mp3")) + list((AUDIO / "ref").glob("*.mp3")):
        if f.stem not in items:
            f.unlink()

    manifest_path.write_text(json.dumps({
        "voice": VOICE,
        "credit": "Voix « siwis » (Piper, jeu de données SIWIS, CC-BY 4.0)",
        "silences": SILENCES,
        "items": items,
    }, separators=(",", ":")))
    total = sum(v["d"] for v in items.values())
    size = sum(f.stat().st_size for f in AUDIO.rglob("*.mp3"))
    print(f"OK : {len(items)} passages, {total / 3600:.1f} h d'audio, {size / 1e6:.1f} Mo.")


if __name__ == "__main__":
    sys.exit(main())
