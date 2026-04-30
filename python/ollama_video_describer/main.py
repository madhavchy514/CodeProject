import os, sys

VENV_PYTHON = os.path.join(os.path.dirname(__file__), "venv", "bin", "python")
if sys.executable != VENV_PYTHON and os.path.exists(VENV_PYTHON):
  os.execl(VENV_PYTHON, VENV_PYTHON, *sys.argv)

import ollama
import dotenv
import cv2

dotenv.load_dotenv()

def describe_local_video(file_path: str):
    if not os.path.exists(file_path):
        print(f"[error]: file not found: {file_path}")
        return

    print(f"[process]: analyzing: {os.path.basename(file_path)}")

    cap = cv2.VideoCapture(file_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    cap.set(cv2.CAP_PROP_POS_FRAMES, int(total_frames * 0.4))
    success, frame = cap.read()
    
    if not success:
        print("[error]: could not extract frame")
        cap.release()
        return

    img_name = "frame.jpg"
    cv2.imwrite(img_name, frame)
    cap.release()

    try:
        response = ollama.chat(
            model=os.getenv('MODEL'),
            messages=[{
                'role': 'user',
                'content': os.getenv('PROMPT'),
                'images': [img_name] 
            }]
        )

        print(f'[response]: {response['message']['content']}')

    except Exception as e:
        print(f"[error]: {e}")

    if os.path.exists(img_name):
        os.remove(img_name)

if __name__ == "__main__":
    describe_local_video(os.getenv('FILE'))