#include <QApplication>
#include <QSurfaceFormat>
#include <QMessageBox>
#include <iostream>

#include "ui/MainWindow.h"
#include "ui/VulkanWindow.h"

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);

    QSurfaceFormat format;
    format.setRenderableType(QSurfaceFormat::Vulkan);
    format.setMajorVersion(1);
    format.setMinorVersion(2);
    format.setDepthBufferSize(32);
    format.setStencilBufferSize(8);
    format.setSamples(1);
    format.setSwapInterval(0);
    QSurfaceFormat::setDefaultFormat(format);

    try {
        MainWindow mainWindow;
        mainWindow.show();
        return app.exec();
    } catch (const std::exception& e) {
        QMessageBox::critical(nullptr, "Fatal Error",
            QString("Fatal error: %1").arg(e.what()));
        return -1;
    }
}
