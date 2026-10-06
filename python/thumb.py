import os
import sys

def venv_python():
  venv = os.path.abspath('.venv/bin/python')
  if sys.executable != venv and os.path.exists(venv):
    os.execl(venv, venv, *sys.argv)

venv_python()
import math
import cv2

def thumb_video(video_path: str, thumb_path: str) -> None:
  try:
    if os.path.exists(thumb_path):
      print(f'[error]: thumb_path exists')
      return

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
      print(f'[failed]: {video_path}')
      return

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    exact_frame = math.ceil(total_frames / 2)
    cap.set(cv2.CAP_PROP_POS_FRAMES, exact_frame)
    ret, frame = cap.read()

    if ret and cv2.imwrite(thumb_path + '.jpg', frame):
      print(f'[success]: {video_path}')
      os.rename(thumb_path + '.jpg', thumb_path)
    else:
      print(f'[failed]: {video_path}')

    cap.release()
    return
  except Exception as e:
    print(f'[error]: {e}')