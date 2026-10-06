#include <iostream>
#include <fcntl.h>
#include <unistd.h>
#include <cstring>
#include <linux/uinput.h>
#include <linux/input.h>
#include <chrono>
#include <thread>
#include <atomic>
#include <filesystem>
#include <vector>

#ifndef BITS_TO_LONGS
#define BITS_TO_LONGS(nr) (((nr) + 8 * sizeof(long) - 1) / (8 * sizeof(long)))
#endif

namespace fs = std::filesystem;

// Atomic flags to track key states asynchronously
std::atomic<bool> is_shift_pressed{false};
std::atomic<bool> is_alt_pressed{false};
std::atomic<bool> running{true};

void emit(int fd, int type, int code, int val) {
    struct input_event ie;
    std::memset(&ie, 0, sizeof(ie));
    ie.type = type;
    ie.code = code;
    ie.value = val;
    write(fd, &ie, sizeof(ie));
}

// Thread function: Monitors physical keyboard devices under /dev/input/
void monitor_keyboards() {
    std::vector<int> fds;

    // Scan all event devices directly under /dev/input
    for (const auto& entry : fs::directory_iterator("/dev/input")) {
        std::string path = entry.path().string();
        
        // Match /dev/input/event*
        if (path.find("/dev/input/event") == 0) {
            int fd = open(path.c_str(), O_RDONLY | O_NONBLOCK);
            if (fd >= 0) {
                unsigned long keybit[BITS_TO_LONGS(KEY_MAX)] = {0};
                
                // Query device key capabilities
                if (ioctl(fd, EVIOCGBIT(EV_KEY, sizeof(keybit)), keybit) >= 0) {
                    bool has_shift = keybit[KEY_LEFTSHIFT / (8 * sizeof(long))] & (1UL << (KEY_LEFTSHIFT % (8 * sizeof(long))));
                    bool has_a     = keybit[KEY_A / (8 * sizeof(long))] & (1UL << (KEY_A % (8 * sizeof(long))));

                    if (has_shift || has_a) {
                        fds.push_back(fd);
                    } else {                    // Check if device supports KEY_A or KEY_LEFTSHIFT (standard keyboard indicator)

                        close(fd);
                    }
                } else {
                    close(fd);
                }
            }
        }
    }

    if (fds.empty()) {
        std::cerr << "Could not open any keyboard event devices under /dev/input/\n";
        return;
    }

    std::cout << "Successfully attached to " << fds.size() << " keyboard input stream(s)!\n";

    // Polling loop to capture raw Shift and Alt key status
    while (running) {
        struct input_event ev;
        for (int fd : fds) {
            while (read(fd, &ev, sizeof(ev)) > 0) {
                if (ev.type == EV_KEY) {
                    // 1 = Press, 2 = Repeat, 0 = Release
                    bool pressed = (ev.value == 1 || ev.value == 2);

                    if (ev.code == KEY_LEFTSHIFT || ev.code == KEY_RIGHTSHIFT) {
                        is_shift_pressed = pressed;
                    }
                    if (ev.code == KEY_LEFTALT || ev.code == KEY_RIGHTALT) {
                        is_alt_pressed = pressed;
                    }
                }
            }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(2));
    }

    for (int fd : fds) close(fd);
}
int main() {
    // 1. Open virtual uinput device
    int fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
    if (fd < 0) {
        std::cerr << "Failed to open /dev/uinput (Are you running with sudo?)\n";
        return 1;
    }

    ioctl(fd, UI_SET_EVBIT, EV_KEY);
    ioctl(fd, UI_SET_KEYBIT, BTN_LEFT);
    ioctl(fd, UI_SET_EVBIT, EV_SYN);

    struct uinput_setup usetup;
    std::memset(&usetup, 0, sizeof(usetup));
    usetup.id.bustype = BUS_USB;
    usetup.id.vendor = 0x1234;
    usetup.id.product = 0x5678;
    std::strcpy(usetup.name, "My C++ Turbo Virtual Autoclicker");

    ioctl(fd, UI_DEV_SETUP, &usetup);
    ioctl(fd, UI_DEV_CREATE);

    std::this_thread::sleep_for(std::chrono::milliseconds(200));

    // 2. Start global keyboard listener thread
    std::thread kbd_thread(monitor_keyboards);

    std::cout << "Autoclicker Loaded!\n";
    std::cout << "  - Hold [Shift]: Maximum Speed Rapid Clicks\n";
    std::cout << "  - Hold [Alt]  : Hold Mouse Button Down\n";
    std::cout << "Press Ctrl+C in terminal to stop.\n\n";

    bool was_holding_alt = false;

    // 3. Main Loop
    while (true) {
        // --- MODE 1: ALT HELD (HOLD CLICK DOWN) ---
        if (is_alt_pressed) {
            if (!was_holding_alt) {
                emit(fd, EV_KEY, BTN_LEFT, 1); // Press down once
                emit(fd, EV_SYN, SYN_REPORT, 0);
                was_holding_alt = true;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
        // Release click as soon as Alt is released
        else if (was_holding_alt) {
            emit(fd, EV_KEY, BTN_LEFT, 0); // Release button
            emit(fd, EV_SYN, SYN_REPORT, 0);
            was_holding_alt = false;
        }

        // --- MODE 2: SHIFT HELD (INSTANT ZERO-DELAY CLICKS) ---
        else if (is_shift_pressed) {
            // Click Down
            emit(fd, EV_KEY, BTN_LEFT, 1);
            emit(fd, EV_SYN, SYN_REPORT, 0);
            std::this_thread::sleep_for(std::chrono::milliseconds(2));

            // Click Up immediately with no sleep delay!
            emit(fd, EV_KEY, BTN_LEFT, 0);
            emit(fd, EV_SYN, SYN_REPORT, 0);
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
        }
        
        // --- IDLE STATE ---
        else {
            // Throttle idle loop to save CPU when nothing is pressed
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
        }
    }

    // Cleanup
    running = false;
    if (kbd_thread.joinable()) kbd_thread.join();

    ioctl(fd, UI_DEV_DESTROY);
    close(fd);

    return 0;
}