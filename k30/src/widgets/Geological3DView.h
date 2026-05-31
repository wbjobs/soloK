#ifndef GEOLOGICAL3DVIEW_H
#define GEOLOGICAL3DVIEW_H

#include "../data/GeologicalModel.h"
#include <QOpenGLWidget>
#include <QOpenGLFunctions>
#include <QMatrix4x4>
#include <QVector3D>
#include <QVector2D>
#include <QPoint>

class Geological3DView : public QOpenGLWidget, protected QOpenGLFunctions
{
    Q_OBJECT
public:
    explicit Geological3DView(QWidget* parent = nullptr);
    ~Geological3DView();

    void setGeologicalModel(GeologicalModel* model);

    void setCutPlaneX(bool enabled, double position);
    void setCutPlaneY(bool enabled, double position);
    void setCutPlaneZ(bool enabled, double position);

    void resetCamera();

protected:
    void initializeGL() override;
    void resizeGL(int w, int h) override;
    void paintGL() override;

    void mousePressEvent(QMouseEvent* event) override;
    void mouseMoveEvent(QMouseEvent* event) override;
    void mouseReleaseEvent(QMouseEvent* event) override;
    void wheelEvent(QWheelEvent* event) override;

private:
    void drawAxes();
    void drawTunnel();
    void drawWaterBodies();
    void drawCutPlane(int index);
    void drawGrid();

    GeologicalModel* m_model;

    QMatrix4x4 m_projectionMatrix;
    QMatrix4x4 m_viewMatrix;
    QMatrix4x4 m_modelMatrix;

    QVector3D m_cameraPosition;
    QVector3D m_cameraTarget;
    QVector3D m_cameraUp;

    float m_rotationX;
    float m_rotationY;
    float m_zoom;

    QPoint m_lastMousePos;
    bool m_isRotating;
    bool m_isPanning;

    bool m_cutPlaneEnabled[3];
    double m_cutPlanePosition[3];
};

#endif
