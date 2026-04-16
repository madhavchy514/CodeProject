#pragma once

#include <cstdint>
#include <cerrno>
#include <fcntl.h>
#include <unistd.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <string>

#include "error.hpp"

class file {
  public:
    enum file_error: int {
      NOT_REG = 1000,
      PARTIAL_WRITE,
      STORAGE_SYNC
    };

    file(const file&) = delete;
    file& operator=(const file&) = delete;
    
    explicit file(std::string file_path): m_fp(std::move(file_path)), m_fl{}, m_lk(false), m_fd(-1) {
      try {
        open();
        if (S_ISREG(stat().st_mode)) return;
        throw error("Given path is not a regular file", file_error::NOT_REG);
      } catch (...) {
        close();
        throw;
      }
    }

    ~file() {
      close();
    }

    void open() {
      if (m_fd != -1) return;
      m_fd = ::open(m_fp.c_str(), O_RDWR | O_CREAT, 0644);
      if (m_fd == -1) {
        throw error("Failed to open file descriptor", errno);
      } else {
        m_lk = false;
      }
    }

    void close() noexcept {
      m_lk = false;
      if (m_fd == -1) return;
      ::close(m_fd);
      m_fd = -1;
    }

    struct stat stat() {
      struct stat s;
      if (fstat(m_fd, &s) != -1) return s;
      throw error("Failed to stat file", errno);
    }

    void lock() {
      if (m_fd == -1) open();
      m_fl.l_len = 0;
      m_fl.l_start = 0;
      m_fl.l_whence = SEEK_SET;
      m_fl.l_type = F_WRLCK;
      if (fcntl(m_fd, F_SETLKW, &m_fl) == -1) {
        throw error("Failed to acquire lock", errno);
      } else {
        m_lk = true;
      }
    }

    void unlock() noexcept {
      if (m_fd == -1) return;
      m_fl.l_len = 0;
      m_fl.l_start = 0;
      m_fl.l_whence = SEEK_SET;
      m_fl.l_type = F_UNLCK;
      fcntl(m_fd, F_SETLK, &m_fl);
      m_lk = false;
    }

    void valid(bool check_lock = false) {
      if (fcntl(m_fd, F_GETFL) == -1 && errno == EBADF) {
        throw error("File descriptor is invalid", EBADFD);
      } else if (check_lock && m_lk == false) {
        throw error("File is not locked by current process", ENOLCK);
      }
    }

    uint64_t read(void* ptr, uint64_t len, uint64_t off) {
      ssize_t bytes_read = pread(m_fd, ptr, len, off);
      switch (bytes_read) {
        case -1: throw error("Failed to read file", errno);
        default: return static_cast<uint64_t>(bytes_read);
      }
    }

    uint64_t write(const void* ptr, uint64_t len, uint64_t off, bool sync = false) {
      ssize_t bytes_write = pwrite(m_fd, ptr, len, off);
      if (bytes_write == -1) {
        throw error("Failed to write file", errno);
      } else if (bytes_write != len) {
        throw error("Partial write occured", file_error::PARTIAL_WRITE);
      } else if (sync && fsync(m_fd) == -1) {
        throw error("Failed to sync file descriptor", file_error::STORAGE_SYNC);
      } else {
        return static_cast<uint64_t>(bytes_write);
      }
    }

  private:
    struct flock m_fl;
    std::string m_fp;
    bool m_lk;
    int m_fd;
};