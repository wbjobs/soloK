#include <QApplication>
#include <QSurfaceFormat>
#include "gui/MainWindow.h"

int main(int argc, char* argv[]) {
    QApplication app(argc, argv);

    app.setApplicationName("SpeckleInterferometry");
    app.setApplicationDisplayName("Laser Speckle Interferometry");
    app.setApplicationVersion("1.0.0");
    app.setOrganizationName("SpeckleLab");

    QSurfaceFormat format;
    format.setSamples(4);
    QSurfaceFormat::setDefaultFormat(format);

    MainWindow window;
    window.show();

    return app.exec();
}
