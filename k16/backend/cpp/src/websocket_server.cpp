#include "websocket_server.h"
#include <iostream>

WebSocketSession::WebSocketSession(tcp::socket socket)
    : ws_(std::move(socket)) {}

WebSocketSession::~WebSocketSession() {}

void WebSocketSession::run() {
    ws_.async_accept(
        beast::bind_front_handler(
            &WebSocketSession::on_accept,
            shared_from_this()
        )
    );
}

void WebSocketSession::send(const std::string& message) {
    ws_.async_write(
        net::buffer(message),
        beast::bind_front_handler(
            &WebSocketSession::on_write,
            shared_from_this()
        )
    );
}

void WebSocketSession::on_accept(beast::error_code ec) {
    if (ec) {
        std::cerr << "WebSocket accept error: " << ec.message() << std::endl;
        return;
    }
    do_read();
}

void WebSocketSession::do_read() {
    ws_.async_read(
        buffer_,
        beast::bind_front_handler(
            &WebSocketSession::on_read,
            shared_from_this()
        )
    );
}

void WebSocketSession::on_read(beast::error_code ec, std::size_t bytes_transferred) {
    if (ec == websocket::error::closed) {
        return;
    }
    if (ec) {
        std::cerr << "WebSocket read error: " << ec.message() << std::endl;
        return;
    }
    buffer_.consume(bytes_transferred);
    do_read();
}

void WebSocketSession::on_write(beast::error_code ec, std::size_t bytes_transferred) {
    if (ec) {
        std::cerr << "WebSocket write error: " << ec.message() << std::endl;
        return;
    }
}

WebSocketServer::WebSocketServer(net::io_context& ioc, uint16_t port)
    : ioc_(ioc)
    , acceptor_(ioc, tcp::endpoint(tcp::v4(), port))
    , running_(false) {}

WebSocketServer::~WebSocketServer() {
    stop();
}

void WebSocketServer::start() {
    running_ = true;
    do_accept();
}

void WebSocketServer::stop() {
    running_ = false;
    acceptor_.close();
}

void WebSocketServer::do_accept() {
    if (!running_) return;

    acceptor_.async_accept(
        beast::bind_front_handler(
            &WebSocketServer::on_accept,
            this
        )
    );
}

void WebSocketServer::on_accept(beast::error_code ec, tcp::socket socket) {
    if (!running_) return;

    if (ec) {
        std::cerr << "Accept error: " << ec.message() << std::endl;
    } else {
        auto session = std::make_shared<WebSocketSession>(std::move(socket));
        addSession(session);
        session->run();
    }

    do_accept();
}

void WebSocketServer::addSession(std::shared_ptr<WebSocketSession> session) {
    std::lock_guard<std::mutex> lock(sessions_mutex_);
    sessions_.insert(session);
}

void WebSocketServer::removeSession(WebSocketSession* session) {
    std::lock_guard<std::mutex> lock(sessions_mutex_);
    sessions_.erase(
        std::remove_if(sessions_.begin(), sessions_.end(),
            [session](const std::shared_ptr<WebSocketSession>& s) {
                return s.get() == session;
            }
        ),
        sessions_.end()
    );
}

void WebSocketServer::broadcast(const std::string& message) {
    std::lock_guard<std::mutex> lock(sessions_mutex_);
    for (const auto& session : sessions_) {
        session->send(message);
    }
}

void WebSocketServer::broadcastPressure(const PressureData& data) {
    json j;
    j["type"] = "pressure";
    j["timestamp"] = data.timestamp;
    j["values"] = std::vector<float>(data.values.begin(), data.values.end());
    broadcast(j.dump());
}

void WebSocketServer::broadcastBalance(const BalanceData& data) {
    json j;
    j["type"] = "balance";
    j["timestamp"] = data.timestamp;
    j["values"] = std::vector<float>(data.values.begin(), data.values.end());
    broadcast(j.dump());
}

void WebSocketServer::broadcastAeroCoefficients(const AeroCoefficients& coeffs) {
    json j;
    j["type"] = "aero";
    j["Cl"] = coeffs.Cl;
    j["Cd"] = coeffs.Cd;
    j["Cm"] = coeffs.Cm;
    j["L_over_D"] = coeffs.L_over_D;
    broadcast(j.dump());
}

void WebSocketServer::broadcastStateChange(SystemState state) {
    json j;
    j["type"] = "state";
    j["state"] = static_cast<int>(state);
    broadcast(j.dump());
}

void WebSocketServer::broadcastFFT(const std::vector<float>& fft_data, double sample_rate) {
    json j;
    j["type"] = "fft";
    j["sampleRate"] = sample_rate;
    j["values"] = fft_data;
    broadcast(j.dump());
}

void WebSocketServer::broadcastQualityMetrics(const QualityMetrics& metrics) {
    json j;
    j["type"] = "quality";
    j["channel_valid"] = metrics.channel_valid;
    j["outliers"] = metrics.outliers;
    j["signal_to_noise"] = metrics.signal_to_noise;
    broadcast(j.dump());
}

void WebSocketServer::broadcastAlert(const std::string& level, const std::string& message) {
    json j;
    j["type"] = "alert";
    j["level"] = level;
    j["message"] = message;
    j["timestamp"] = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();
    broadcast(j.dump());
}
