#include "UDPSocket.h"
#include <cstring>

#ifdef _WIN32
#include <ws2tcpip.h>
#else
#include <fcntl.h>
#include <errno.h>
#endif

UDPSocket::UDPSocket() :
#ifdef _WIN32
    m_socket(INVALID_SOCKET),
#else
    m_socket(-1),
#endif
    m_isBound(false),
    m_wsaInitialized(false) {
}

UDPSocket::~UDPSocket() {
    close();
}

bool UDPSocket::initialize() {
#ifdef _WIN32
    if (!m_wsaInitialized) {
        WSADATA wsaData;
        if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
            return false;
        }
        m_wsaInitialized = true;
    }
    m_socket = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    return m_socket != INVALID_SOCKET;
#else
    m_socket = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    return m_socket >= 0;
#endif
}

bool UDPSocket::bind(int port, const std::string& ip) {
    if (!initialize()) {
        return false;
    }

    sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);

#ifdef _WIN32
    InetPtonA(AF_INET, ip.c_str(), &addr.sin_addr);
#else
    inet_pton(AF_INET, ip.c_str(), &addr.sin_addr);
#endif

#ifdef _WIN32
    if (::bind(m_socket, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) == SOCKET_ERROR) {
        return false;
    }
    u_long mode = 1;
    ioctlsocket(m_socket, FIONBIO, &mode);
#else
    if (::bind(m_socket, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
        return false;
    }
    int flags = fcntl(m_socket, F_GETFL, 0);
    fcntl(m_socket, F_SETFL, flags | O_NONBLOCK);
#endif

    m_isBound = true;
    return true;
}

bool UDPSocket::receive(uint8_t* buffer, size_t bufferSize, int& bytesReceived,
    std::string& senderIp, int& senderPort, int timeoutMs) {

    if (!m_isBound) return false;

    fd_set readSet;
    FD_ZERO(&readSet);
    FD_SET(m_socket, &readSet);

    timeval timeout;
    timeout.tv_sec = timeoutMs / 1000;
    timeout.tv_usec = (timeoutMs % 1000) * 1000;

#ifdef _WIN32
    int result = select(0, &readSet, nullptr, nullptr, &timeout);
#else
    int result = select(m_socket + 1, &readSet, nullptr, nullptr, &timeout);
#endif

    if (result <= 0) return false;

    sockaddr_in senderAddr;
#ifdef _WIN32
    int addrLen = sizeof(senderAddr);
#else
    socklen_t addrLen = sizeof(senderAddr);
#endif

#ifdef _WIN32
    bytesReceived = recvfrom(m_socket, reinterpret_cast<char*>(buffer),
        static_cast<int>(bufferSize), 0,
        reinterpret_cast<sockaddr*>(&senderAddr), &addrLen);
#else
    bytesReceived = recvfrom(m_socket, buffer, bufferSize, 0,
        reinterpret_cast<sockaddr*>(&senderAddr), &addrLen);
#endif

    if (bytesReceived <= 0) return false;

    char ipStr[INET_ADDRSTRLEN];
#ifdef _WIN32
    InetNtopA(AF_INET, &senderAddr.sin_addr, ipStr, INET_ADDRSTRLEN);
#else
    inet_ntop(AF_INET, &senderAddr.sin_addr, ipStr, INET_ADDRSTRLEN);
#endif
    senderIp = ipStr;
    senderPort = ntohs(senderAddr.sin_port);

    return true;
}

void UDPSocket::close() {
#ifdef _WIN32
    if (m_socket != INVALID_SOCKET) {
        closesocket(m_socket);
        m_socket = INVALID_SOCKET;
    }
    if (m_wsaInitialized) {
        WSACleanup();
        m_wsaInitialized = false;
    }
#else
    if (m_socket >= 0) {
        ::close(m_socket);
        m_socket = -1;
    }
#endif
    m_isBound = false;
}
