#include <iostream>
#include <Windows.h>

using namespace std;

void simulateMouseHold() {
  mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
}

void simulateMouseRelease() {
  mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
}

void simulateMouseClick() {
  mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
  mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
}

int main() {
  int clickInterval;

  cout << "Click Interval (ms): ";
  cin >> clickInterval;

  bool holdMode = false;

  cout << "\nControls:\n";
  cout << "  Alt   = Hold Left Mouse Button\n";
  cout << "  Shift = Auto Click\n\n";

  DWORD lastClick = GetTickCount();

  while (true) {
    if (GetAsyncKeyState(VK_MENU) & 0x8000) {
      if (!holdMode) {
        simulateMouseHold();
        holdMode = true;
        cout << "Alt held. Mouse button held.\n";
      }
    } else {
      if (holdMode) {
        simulateMouseRelease();
        holdMode = false;
        cout << "Alt released. Mouse button released.\n";
      }
    }

    if (GetAsyncKeyState(VK_SHIFT) & 0x8000) {
      DWORD now = GetTickCount();
      if (now - lastClick >= (DWORD)clickInterval) {
        simulateMouseClick();
        lastClick = now;
      }
    }

    Sleep(1);
  }

  return 0;
}