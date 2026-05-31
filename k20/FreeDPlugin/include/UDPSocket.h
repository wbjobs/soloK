#pragma once
#include <string>
#include <vector>
#include <cstdint>

#ifdef _WIN32
#include <winsock2.h>
#pragma comment(lib, "ws2_32.lib")
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#endif

class UDPSocket {
public:
    UDPSocket();
    ~UDPSocket();

    bool bind(int port, const std::string& ip = "0.0.0.0");
    bool receive(uint8_t* buffer, size_t bufferSize, int& bytesReceived,
        std::string& senderIp, int& senderPort, int timeoutMs = 100);
    void close();
    bool isBound() const { return m_isBound; }

private:
#ifdef _WIN32
    SOCKET m_socket;
#else
    int m_socket;
#endif
    bool m_isBound;
    bool m_wsaInitialized;

    bool initialize();
};
