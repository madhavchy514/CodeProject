import os, sys

VENV_PYTHON = os.path.join(os.path.dirname(__file__), "venv", "bin", "python")
if sys.executable != VENV_PYTHON and os.path.exists(VENV_PYTHON):
  os.execl(VENV_PYTHON, VENV_PYTHON, *sys.argv)

import yt_dlp

def download_progress_hook(meta):
  if meta["status"] == "downloading":
    percent = meta.get("_percent_str", "0%")
    speed = "".join(meta.get("_speed_str", "0b/s").split())
    eta = meta.get("_eta_str", "00:00")
    sys.stdout.write(f"\r[downloading]: {percent} | eta: {eta} | speed: {speed}\033[K")
    sys.stdout.flush()

  elif meta["status"] == "finished":
    sys.stdout.write("\n") 
    filename = os.path.basename(meta.get("filename", "file"))
    print(f"[completed]: {filename}")


def download_youtube(url: str, dir: str = ".", quality: str = "best", noplaylist: bool = True) -> None:
  quality_map = {
    "best": "best[vcodec!=none][acodec!=none]/best",
    "2160p": "best[height<=2160][vcodec!=none][acodec!=none]/best",
    "1440p": "best[height<=1440][vcodec!=none][acodec!=none]/best",
    "1080p": "best[height<=1080][vcodec!=none][acodec!=none]/best",
    "720p": "best[height<=720][vcodec!=none][acodec!=none]/best",
    "480p": "best[height<=480][vcodec!=none][acodec!=none]/best",
    "360p": "best[height<=360][vcodec!=none][acodec!=none]/best",
    "240p": "best[height<=240][vcodec!=none][acodec!=none]/best",
    "144p": "best[height<=144][vcodec!=none][acodec!=none]/best",
  }

  class SilentLogger:
    def debug(self, msg): pass
    def warning(self, msg): pass
    def error(self, msg): pass
    def info(self, msg): pass
  
  ydl_opts = {
    "format": quality_map.get(quality.lower(), quality_map["best"]),
    "outtmpl": os.path.join(dir, "%(id)s.%(ext)s"),
    "recode_video": "mp4",
    "noplaylist": noplaylist,
    "quiet": True,
    "no_warnings": True,
    "progress_hooks": [download_progress_hook],
    "logger": SilentLogger(),
    "postprocessors": [{
      "key": "FFmpegMetadata",
      "add_metadata": True,
    }],
  }

  print(f"[processing]: processing youtube link")

  try:
    os.makedirs(dir, exist_ok=True)
  except Exception as e:
    print(f"[error]: failed to create folder: {e}")
    return

  try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
      ydl.download([url])
  except Exception as e: 
    print(f"[error]: failed to download: {e}")
    return

if __name__ == "__main__":
  if (len(sys.argv) < 5):
    print(f"[usage]: python ytd.py <url> <folder> <quality> <playlist>")
    print(f"[example]: python ytd.py https://youtu.be/dQw4w9WgXcQ ./Downloads 720p false")
  else:
    URL = sys.argv[1]
    FOLDER = sys.argv[2]
    QUALITY = sys.argv[3]
    PLAYLIST = True if sys.argv[4].lower() == "true" else False
    download_youtube(URL, FOLDER, QUALITY, PLAYLIST != True)