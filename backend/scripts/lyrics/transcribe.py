# Whisper (faster-whisper) for `npm run lyrics:build`, kept running with its model loaded: it reads one job per line
# on stdin, {"path": "<audio file>", "lang": "es"|"en"|null, "start": <s>, "end": <s or null>}, and answers one line on
# stdout, {"words": [[start, end, word, probability], ...], "duration": <s>} (times in seconds of the whole file), or
# {"error": "..."}. Uses the GPU when it can (CUDA, float16, large-v3), else the CPU (int8, medium).
#
# Runs in backend/private/lyrics-tools/.venv (faster-whisper, imageio-ffmpeg, numpy; nvidia-cublas-cu12 and
# nvidia-cudnn-cu12 for the GPU). Audio is decoded with imageio-ffmpeg's ffmpeg (PyAV doesn't install on this machine).
import glob, json, os, subprocess, sys

sys.stdout.reconfigure(encoding="utf-8")
sys.stdin.reconfigure(encoding="utf-8")

# The NVIDIA libraries installed with pip, where Windows can find them.
for d in glob.glob(os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "*", "bin")):
    os.add_dll_directory(d)
    os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")

import numpy as np
import imageio_ffmpeg
from faster_whisper import WhisperModel

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 16000


def load_model():
    try:
        model = WhisperModel("large-v3", device="cuda", compute_type="float16")
        # A first tiny run: a broken CUDA setup only fails when it's used.
        list(model.transcribe(np.zeros(SR, dtype=np.float32), language="en")[0])
        return model, "cuda large-v3"
    except Exception as err:  # noqa: BLE001 - any CUDA failure falls back to the CPU
        print(json.dumps({"log": f"GPU no disponible ({str(err)[:120]}); uso el CPU"}), flush=True)
        return WhisperModel("medium", device="cpu", compute_type="int8"), "cpu medium"


def decode(path, start=0.0, end=None):
    cmd = [FFMPEG, "-v", "quiet", "-ss", str(start)]
    if end is not None:
        cmd += ["-t", str(max(0.05, end - start))]
    cmd += ["-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)


model, where = load_model()
print(json.dumps({"ready": where}), flush=True)

for line in sys.stdin:
    if not line.strip():
        continue
    try:
        job = json.loads(line)
        start = float(job.get("start") or 0)
        audio = decode(job["path"], start, job.get("end"))
        segments, _ = model.transcribe(
            audio, language=job.get("lang") or None, word_timestamps=True, beam_size=5,
            condition_on_previous_text=False, vad_filter=False,
        )
        words = []
        for seg in segments:
            for w in seg.words or []:
                words.append([round(start + w.start, 3), round(start + w.end, 3), w.word.strip(), round(w.probability, 3)])
        print(json.dumps({"words": words, "duration": round(len(audio) / SR, 3)}, ensure_ascii=False), flush=True)
    except Exception as err:  # noqa: BLE001 - one bad file must not stop the run
        print(json.dumps({"error": str(err)[:300]}), flush=True)
