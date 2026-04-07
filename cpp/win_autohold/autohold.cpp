#include <iostream>
#include <Windows.h>

using namespace std;
void simulateMouseHold() {
  mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
}

void simulateMouseRelease() {
  mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
}

int main() {
  bool mode = false;
  cout << "Hold Alt to simulate mouse hold. Release Alt to stop." << endl;

  while (true) {
    if (GetAsyncKeyState(VK_MENU) & 0x8000) {
      if (!mode) {
        simulateMouseHold();
        mode = true;
        cout << "Alt held. Mouse button held down." << endl;
      }
      simulateMouseHold();
    } else {
      if (mode) {
        simulateMouseRelease();
        mode = false;
        cout << "Alt released. Mouse button released." << endl;
      }
    }
    Sleep(10);
  }
  
  return 0;
}