#include <stdio.h>
#include <iostream>
#include <Windows.h>

using namespace std;

void simulateMouseClick() {
  mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
  mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
}

int main() {
  int time;

  cout << "Click Interval (ms): ";
  cin >> time;

  bool mode = false;
  cout << "Hold Alt to simulate mouse hold. Release Alt to stop." << endl;

  while (true) {
    if (GetAsyncKeyState(VK_MENU) & 0x8000) {
      if (!mode) {
        simulateMouseClick();
        mode = true;
        cout << "Alt held. Clicking start." << endl;
      }
      simulateMouseClick();
    } else {
      if (mode) {
        simulateMouseClick();
        mode = false;
        cout << "Alt released. Clicking stopped." << endl;
      }
    }
    Sleep(time);
  }

  return 0;
}