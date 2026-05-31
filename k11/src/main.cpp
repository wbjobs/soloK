#include "gui/MainWindow.h"
#include <QApplication>
#include <QSurfaceFormat>
#include <QVTKOpenGLNativeWidget.h>
#include <vtkOpenGLRenderWindow.h>

int main(int argc, char* argv[]) {
    QSurfaceFormat::setDefaultFormat(QVTKOpenGLNativeWidget::defaultFormat());
    
    QApplication app(argc, argv);
    
    QApplication::setApplicationName("Fossil3D");
    QApplication::setApplicationDisplayName("古生物化石三维重建系统");
    QApplication::setApplicationVersion("1.0.0");
    QApplication::setOrganizationName("Fossil3D");
    
    Fossil3D::MainWindow window;
    window.show();
    
    return app.exec();
}
