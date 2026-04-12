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
    std::string m_file_path;
    int m_fd;

    struct flock m_fl;
    bool m_locked;

    enum file_error: int {
      NOT_FILE, IS_EOF, PARTIAL_WRITE, SYNC
    };

    explicit file(const std::string& file_path) {
      m_file_path = file_path;
      m_fd = -1;

      m_fl.l_len = 0;
      m_fl.l_start = 0;
      m_fl.l_whence = SEEK_SET;
      m_locked = false;

      open_fd();
      if (S_ISREG(stat_fd().st_mode)) return;
      throw error("Given path is not a regular file", file_error::NOT_FILE);
    }

    void open_fd() {
      if (m_fd != -1) return;
      m_fd = open(m_file_path.c_str(), O_RDWR | O_CREAT, 0644);
      if (m_fd != -1) return;
      throw error("Failed to open file descriptor", errno);
    }

    void close_fd() noexcept {
      m_locked = false;
      if (m_fd == -1) return;
      close(m_fd);
      m_fd = -1;
    }

    struct stat stat_fd() {
      struct stat s;
      if (fstat(m_fd, &s) != -1) return s;
      throw error("Failed to stat file", errno);
    }

    void lock_fd() {
      if (m_fd == -1) open_fd();
      m_fl.l_type = F_WRLCK;
      if (fcntl(m_fd, F_SETLKW, &m_fl) == -1) {
        throw error("Failed to acquire lock", errno);
      } else {
        m_locked = true;
      }
    }

    void unlock_fd() noexcept {
      if (m_fd == -1) return;
      m_fl.l_type = F_UNLCK;
      fcntl(m_fd, F_SETLK, &m_fl);
      m_locked = false;
    }

    void valid_fd(bool check_lock = false) {
      if (fcntl(m_fd, F_GETFL) == -1 && errno == EBADF) {
        throw error("File descriptor is invalid", EBADFD);
      } else if (m_locked == false) {
        throw error("File is not locked by current process", ENOLCK);
      }
    }

    uint64_t read_fd(void* ptr, uint64_t len, uint64_t off, bool eof = true) {
      ssize_t bytes_read = pread(m_fd, ptr, len, off);
      if (bytes_read == -1) {
        throw error("Failed to read file", errno);
      } else if (!eof && bytes_read != len) {
        throw error("Given offset and length exceeds EOF", file_error::IS_EOF);
      } else {
        return static_cast<uint64_t>(bytes_read);
      }
    }

    uint64_t write_fd(const void* ptr, uint64_t len, uint64_t off, bool sync = false, bool partial = false) {
      ssize_t bytes_write = pwrite(m_fd, ptr, len, off);
      if (bytes_write == -1) {
        throw error("Failed to write file", errno);
      } else if (!partial && bytes_write != len) {
        throw error("Partial write occured", file_error::PARTIAL_WRITE);
      } else if (sync && fsync(m_fd) == -1) {
        throw error("Failed to sync file descriptor", file_error::SYNC);
      } else {
        return static_cast<uint64_t>(bytes_write);
      }
    }
};