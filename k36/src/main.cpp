#include <QApplication>
#include <QSurfaceFormat>
#include <QVTKOpenGLWidget.h>
#include <QIcon>
#include <QTextCodec>

#include "gui/MainWindow.h"

int main(int argc, char* argv[])
{
    QSurfaceFormat::setDefaultFormat(QVTKOpenGLWidget::defaultFormat());

    QSurfaceFormat format;
    format.setDepthBufferSize(24);
    format.setStencilBufferSize(8);
    format.setSamples(4);
    format.setVersion(3, 2);
    format.setProfile(QSurfaceFormat::CoreProfile);
    QSurfaceFormat::setDefaultFormat(format);

    QApplication app(argc, argv);
    app.setApplicationName("TreeLidar 3D");
    app.setApplicationVersion("1.0.0");
    app.setOrganizationName("ForestRemoteSensing");

    QTextCodec::setCodecForLocale(QTextCodec::codecForName("UTF-8"));

    forest::MainWindow window;
    window.resize(1600, 1000);
    window.show();

    return app.exec();
}
