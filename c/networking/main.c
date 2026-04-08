#define MAX_EVENTS 64

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <netinet/in.h>

int make_non_blocking(int fd) {
  int flags = fcntl(fd, F_GETFL, 0);
  if (flags == -1) return -1;
  return fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

int main() {
  int listen_fd, epoll_fd;
  struct epoll_event event, events[MAX_EVENTS];
  uint16_t port = 3000;

  listen_fd = socket(AF_INET, SOCK_STREAM, 0);
  make_non_blocking(listen_fd);

  struct sockaddr_in addr;
  addr.sin_family = AF_INET;
  addr.sin_port = htons(port);
  addr.sin_addr.s_addr = INADDR_ANY;

  bind(listen_fd, (struct sockaddr*)&addr, sizeof(addr));
  listen(listen_fd, SOMAXCONN);

  epoll_fd = epoll_create1(0);

  event.events = EPOLLIN;
  event.data.fd = listen_fd;
  epoll_ctl(epoll_fd, EPOLL_CTL_ADD, listen_fd, &event);

  printf("server on port %d\n", port);

  while (1) {
    int n = epoll_wait(epoll_fd, events, MAX_EVENTS, -1);

    for (int i = 0; i < n; i++) {
      if (events[i].data.fd == listen_fd) {
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        int conn_fd = accept(listen_fd, (struct sockaddr *)&client_addr, &client_len);

        make_non_blocking(conn_fd);
        event.events = EPOLLIN | EPOLLET;
        event.data.fd = conn_fd;
        epoll_ctl(epoll_fd, EPOLL_CTL_ADD, conn_fd, &event);
        printf("client connected\n");
      }
      else {
        char buf[1024];
        int fd = events[i].data.fd;
        ssize_t count = read(fd, buf, sizeof(buf));
        if (count > 0) {
          write(fd, "Echo: ", 6);
          write(fd, buf, count);
        } else if (count == 0 || (count == -1 && errno != EAGAIN)) {
          printf("client disconnected\n");
          close(fd);
        }
      }
    }
  }

  return 0;
}