#include "MainWindow.h"
#include <QApplication>

int main(int argc, char* argv[])
{
    QApplication app(argc, argv);
    app.setApplicationName("红外探水隧道超前预报系统");
    app.setApplicationVersion("1.0.0");

    MainWindow w;
    w.show();

    return app.exec();
}
