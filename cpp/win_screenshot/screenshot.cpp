#include <windows.h>
#include <shlobj.h>
#include <string>
#include <ctime>
#include <sstream>
#include <iostream>

std::wstring g_saveFolder;
bool PickFolder(std::wstring &folderPath) {
  BROWSEINFOW bi = { 0 };
  bi.lpszTitle = L"Select folder to save screenshots:";
  bi.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE;
  LPITEMIDLIST pidl = SHBrowseForFolderW(&bi);
  if (pidl != nullptr) {
    wchar_t path[MAX_PATH];
    if (SHGetPathFromIDListW(pidl, path)) {
      folderPath = path;
      CoTaskMemFree(pidl);
      return true;
    }
    CoTaskMemFree(pidl);
  }
  return false;
}

bool SaveBitmapToFile(HBITMAP hBitmap, HDC hDC, LPCWSTR filename) {
  BITMAP bmp;
  GetObjectW(hBitmap, sizeof(BITMAP), &bmp);
  BITMAPFILEHEADER bmfHeader = { 0 };
  BITMAPINFOHEADER bi = { 0 };
  bi.biSize = sizeof(BITMAPINFOHEADER);
  bi.biWidth = bmp.bmWidth;
  bi.biHeight = -bmp.bmHeight;
  bi.biPlanes = 1;
  bi.biBitCount = 32;
  bi.biCompression = BI_RGB;
  DWORD dwBmpSize = ((bmp.bmWidth * bi.biBitCount + 31) / 32) * 4 * bmp.bmHeight;
  HANDLE hDIB = GlobalAlloc(GHND, dwBmpSize);
  char* lpbitmap = (char*)GlobalLock(hDIB);
  GetDIBits(hDC, hBitmap, 0, (UINT)bmp.bmHeight, lpbitmap, (BITMAPINFO*)&bi, DIB_RGB_COLORS);
  HANDLE hFile = CreateFileW(filename, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  DWORD dwSizeofDIB = dwBmpSize + sizeof(BITMAPFILEHEADER) + sizeof(BITMAPINFOHEADER);
  bmfHeader.bfOffBits = sizeof(BITMAPFILEHEADER) + sizeof(BITMAPINFOHEADER);
  bmfHeader.bfSize = dwSizeofDIB;
  bmfHeader.bfType = 0x4D42;
  DWORD dwBytesWritten;
  WriteFile(hFile, (LPSTR)&bmfHeader, sizeof(BITMAPFILEHEADER), &dwBytesWritten, NULL);
  WriteFile(hFile, (LPSTR)&bi, sizeof(BITMAPINFOHEADER), &dwBytesWritten, NULL);
  WriteFile(hFile, (LPSTR)lpbitmap, dwBmpSize, &dwBytesWritten, NULL);
  GlobalUnlock(hDIB);
  GlobalFree(hDIB);
  CloseHandle(hFile);
  return true;
}

void TakeScreenshot() {
  HDC hScreenDC = GetDC(NULL);
  HDC hMemoryDC = CreateCompatibleDC(hScreenDC);
  int width = GetSystemMetrics(SM_CXSCREEN);
  int height = GetSystemMetrics(SM_CYSCREEN);
  HBITMAP hBitmap = CreateCompatibleBitmap(hScreenDC, width, height);
  SelectObject(hMemoryDC, hBitmap);
  BitBlt(hMemoryDC, 0, 0, width, height, hScreenDC, 0, 0, SRCCOPY);
  std::wstringstream ws;
  std::time_t t = std::time(nullptr);
  tm localTime;
  localtime_s(&localTime, &t);
  ws << g_saveFolder << L"\\screenshot_"
    << (localTime.tm_year + 1900) << L"-"
    << (localTime.tm_mon + 1) << L"-"
    << localTime.tm_mday << L"_"
    << localTime.tm_hour << L"-"
    << localTime.tm_min << L"-"
    << localTime.tm_sec << L".bmp";
  SaveBitmapToFile(hBitmap, hMemoryDC, ws.str().c_str());
  DeleteObject(hBitmap);
  DeleteDC(hMemoryDC);
  ReleaseDC(NULL, hScreenDC);
  std::wcout << L"Saved screenshot to: " << ws.str() << std::endl;
}

int wmain() {
  if (!PickFolder(g_saveFolder)) {
    std::wcout << L"No folder selected. Exiting..." << std::endl;
    system("pause");
    return 0;
  }
  if (!RegisterHotKey(NULL, 1, MOD_CONTROL | MOD_SHIFT, 'P')) {
    std::wcout << L"Failed to register hotkey!" << std::endl;
    system("pause");
    return 0;
  }
  std::wcout << L"Press Ctrl+Shift+P to take a screenshot.\nPress Ctrl+C to quit." << std::endl;
  MSG msg = { 0 };
  while (GetMessage(&msg, NULL, 0, 0) != 0) {
    if (msg.message == WM_HOTKEY && msg.wParam == 1) {
      TakeScreenshot();
    }
  }
  UnregisterHotKey(NULL, 1);
  return 0;
}

// g++ screenshot.cpp -municode -lgdi32 -lshell32 -lole32 -o screenshot.exe
