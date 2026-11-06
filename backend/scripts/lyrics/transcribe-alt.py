# The other transcriber for `npm run lyrics:build -- --engine alt`, for previews where Whisper hears no singing (the
# music covers it): the voice is separated from the music first (torchaudio's Hybrid Demucs), then transcribed with
# wav2vec2 (Spanish or English), each word with its time and how sure it is. Same protocol as transcribe.py: one job
# per line on stdin, {"path", "lang": "es"|"en"|null, "start", "end"}, and one line on stdout, {"words": [[start, end,
# word, probability], ...], "duration"} (times in seconds of the whole file), or {"error": "..."}. Each file's voice
# is separated once and kept while its song is worked out (the checks ask for bits of it).
#
# Runs in backend/private/lyrics-tools/.venv-alt:
#   py -3.13 -m venv .venv-alt
#   .venv-alt\Scripts\python -m pip install torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu126
#   .venv-alt\Scripts\python -m pip install transformers==4.57.1 imageio-ffmpeg numpy
import json, subprocess, sys

sys.stdout.reconfigure(encoding="utf-8")
sys.stdin.reconfigure(encoding="utf-8")

import numpy as np
import imageio_ffmpeg
import torch
import torchaudio
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 16000
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODELS = {"es": "jonatasgrosman/wav2vec2-large-xlsr-53-spanish", "en": "jonatasgrosman/wav2vec2-large-xlsr-53-english"}

bundle = torchaudio.pipelines.HDEMUCS_HIGH_MUSDB_PLUS
separator = bundle.get_model().to(DEVICE).eval()
VOCALS = separator.sources.index("vocals")
asr = {}
voices = {}  # path -> the separated voice, 16 kHz mono


def recognizer(lang):
    if lang not in asr:
        processor = Wav2Vec2Processor.from_pretrained(MODELS[lang])
        model = Wav2Vec2ForCTC.from_pretrained(MODELS[lang]).to(DEVICE).eval()
        asr[lang] = (processor, model)
    return asr[lang]


def decode(path):
    cmd = [FFMPEG, "-v", "quiet", "-i", path, "-ac", "2", "-ar", str(bundle.sample_rate), "-f", "f32le", "-"]
    pcm = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)
    return torch.from_numpy(pcm.copy()).reshape(-1, 2).T


@torch.inference_mode()
def voice_of(path):
    """The voice alone, separated in 10 s pieces that overlap a little (the GPU has little memory)."""
    if path in voices:
        return voices[path]
    mix = decode(path).to(DEVICE)
    ref = mix.mean(0)
    mix = (mix - ref.mean()) / (ref.std() + 1e-8)
    size, overlap = bundle.sample_rate * 10, bundle.sample_rate // 10
    total = mix.shape[1]
    out = torch.zeros(2, total, device=DEVICE)
    weight = torch.zeros(total, device=DEVICE)
    fade = torch.ones(size + overlap, device=DEVICE)
    fade[:overlap] = torch.linspace(0, 1, overlap, device=DEVICE)
    fade[-overlap:] = torch.linspace(1, 0, overlap, device=DEVICE)
    for start in range(0, total, size):
        a, b = max(0, start - overlap // 2), min(total, start + size + overlap // 2)
        piece = separator(mix[None, :, a:b])[0, VOCALS]
        w = fade[: b - a].clone()
        if a == 0:
            w[:overlap] = 1
        if b == total:
            w[-min(overlap, b - a):] = 1
        out[:, a:b] += piece * w
        weight[a:b] += w
    vocals = (out / weight.clamp(min=1e-6)) * ref.std() + ref.mean()
    voice = torchaudio.functional.resample(vocals.mean(0), bundle.sample_rate, SR).cpu()
    voices.clear()  # only the song being worked out
    voices[path] = voice
    return voice


@torch.inference_mode()
def transcribe(audio, lang, offset):
    processor, model = recognizer(lang)
    inputs = processor(audio.numpy(), sampling_rate=SR, return_tensors="pt").input_values.to(DEVICE)
    probs = torch.softmax(model(inputs).logits[0].float(), dim=-1)
    best, ids = probs.max(dim=-1)
    tok = processor.tokenizer
    blank, space = tok.pad_token_id, tok.word_delimiter_token_id
    seconds = inputs.shape[1] / SR / probs.shape[0]  # one frame
    words, chars, frames, prev = [], [], [], None

    def close():
        if chars:
            words.append([round(offset + frames[0] * seconds, 3), round(offset + (frames[-1] + 1) * seconds, 3), "".join(chars), round(float(np.mean([best[f].item() for f in frames])), 3)])
        chars.clear()
        frames.clear()

    for f, i in enumerate(ids.tolist()):
        if i == space:
            close()
        elif i != blank and i != prev:
            chars.append(tok.convert_ids_to_tokens(i))
            frames.append(f)
        elif i != blank and frames:
            frames.append(f)
        prev = i
    close()
    return words


print(json.dumps({"ready": f"{DEVICE} hdemucs + wav2vec2"}), flush=True)

for line in sys.stdin:
    if not line.strip():
        continue
    try:
        job = json.loads(line)
        voice = voice_of(job["path"])
        start = float(job.get("start") or 0)
        end = job.get("end")
        clip = voice[int(start * SR): int(end * SR) if end is not None else None]
        if job.get("lang") in MODELS:
            words = transcribe(clip, job["lang"], start)
        else:
            # Language unknown (a Spotify song's): the one that hears more, and more surely.
            words = max((transcribe(clip, lang, start) for lang in MODELS), key=lambda ws: sum(w[3] for w in ws))
        print(json.dumps({"words": words, "duration": round(len(clip) / SR, 3)}, ensure_ascii=False), flush=True)
    except Exception as err:  # noqa: BLE001 - one bad file must not stop the run
        print(json.dumps({"error": str(err)[:300]}), flush=True)
