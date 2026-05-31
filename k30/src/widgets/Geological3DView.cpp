#include "Geological3DView.h"
#include <QMouseEvent>
#include <QWheelEvent>
#include <QColor>
#include <cmath>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

Geological3DView::Geological3DView(QWidget* parent)
    : QOpenGLWidget(parent)
    , m_model(nullptr)
    , m_rotationX(30.0f)
    , m_rotationY(45.0f)
    , m_zoom(60.0f)
    , m_isRotating(false)
    , m_isPanning(false)
{
    m_cameraPosition = QVector3D(0, 0, 60);
    m_cameraTarget = QVector3D(0, 0, 25);
    m_cameraUp = QVector3D(0, 1, 0);

    for (int i = 0; i < 3; ++i) {
        m_cutPlaneEnabled[i] = false;
        m_cutPlanePosition[i] = 0.0;
    }

    setMinimumSize(400, 300);
}

Geological3DView::~Geological3DView()
{
}

void Geological3DView::setGeologicalModel(GeologicalModel* model)
{
    m_model = model;
    update();
}

void Geological3DView::setCutPlaneX(bool enabled, double position)
{
    m_cutPlaneEnabled[0] = enabled;
    m_cutPlanePosition[0] = position;
    update();
}

void Geological3DView::setCutPlaneY(bool enabled, double position)
{
    m_cutPlaneEnabled[1] = enabled;
    m_cutPlanePosition[1] = position;
    update();
}

void Geological3DView::setCutPlaneZ(bool enabled, double position)
{
    m_cutPlaneEnabled[2] = enabled;
    m_cutPlanePosition[2] = position;
    update();
}

void Geological3DView::resetCamera()
{
    m_rotationX = 30.0f;
    m_rotationY = 45.0f;
    m_zoom = 60.0f;
    m_cameraPosition = QVector3D(0, 0, 60);
    update();
}

void Geological3DView::initializeGL()
{
    initializeOpenGLFunctions();
    glClearColor(0.95f, 0.95f, 0.95f, 1.0f);
    glEnable(GL_DEPTH_TEST);
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
}

void Geological3DView::resizeGL(int w, int h)
{
    glViewport(0, 0, w, h);
    m_projectionMatrix.setToIdentity();
    m_projectionMatrix.perspective(45.0f, float(w) / float(h), 0.1f, 1000.0f);
}

void Geological3DView::paintGL()
{
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    m_viewMatrix.setToIdentity();
    m_viewMatrix.lookAt(m_cameraPosition, m_cameraTarget, m_cameraUp);
    m_viewMatrix.rotate(m_rotationX, 1, 0, 0);
    m_viewMatrix.rotate(m_rotationY, 0, 1, 0);
    m_viewMatrix.scale(1.0f / m_zoom * 10.0f);

    m_modelMatrix.setToIdentity();
    m_modelMatrix.translate(0, 0, 0);

    QMatrix4x4 mvp = m_projectionMatrix * m_viewMatrix * m_modelMatrix;

    drawGrid();
    drawAxes();
    drawTunnel();
    drawWaterBodies();

    for (int i = 0; i < 3; ++i) {
        if (m_cutPlaneEnabled[i]) {
            drawCutPlane(i);
        }
    }
}

void Geological3DView::mousePressEvent(QMouseEvent* event)
{
    m_lastMousePos = event->pos();
    if (event->button() == Qt::LeftButton) {
        m_isRotating = true;
    } else if (event->button() == Qt::RightButton) {
        m_isPanning = true;
    }
}

void Geological3DView::mouseMoveEvent(QMouseEvent* event)
{
    int dx = event->x() - m_lastMousePos.x();
    int dy = event->y() - m_lastMousePos.y();

    if (m_isRotating) {
        m_rotationY += dx * 0.5f;
        m_rotationX += dy * 0.5f;
        m_rotationX = std::max(-89.0f, std::min(89.0f, m_rotationX));
        update();
    } else if (m_isPanning) {
        float scale = 0.1f * m_zoom;
        m_cameraTarget.setX(m_cameraTarget.x() - dx * scale);
        m_cameraTarget.setY(m_cameraTarget.y() + dy * scale);
        update();
    }

    m_lastMousePos = event->pos();
}

void Geological3DView::mouseReleaseEvent(QMouseEvent* event)
{
    Q_UNUSED(event);
    m_isRotating = false;
    m_isPanning = false;
}

void Geological3DView::wheelEvent(QWheelEvent* event)
{
    float delta = event->angleDelta().y() / 120.0f;
    m_zoom *= (1.0f - delta * 0.1f);
    m_zoom = std::max(10.0f, std::min(200.0f, m_zoom));
    update();
}

void Geological3DView::drawAxes()
{
    glBegin(GL_LINES);

    glColor3f(1.0f, 0.0f, 0.0f);
    glVertex3f(0, 0, 0);
    glVertex3f(10, 0, 0);

    glColor3f(0.0f, 1.0f, 0.0f);
    glVertex3f(0, 0, 0);
    glVertex3f(0, 10, 0);

    glColor3f(0.0f, 0.0f, 1.0f);
    glVertex3f(0, 0, 0);
    glVertex3f(0, 0, 10);

    glEnd();
}

void Geological3DView::drawTunnel()
{
    if (!m_model) return;

    const auto& outline = m_model->tunnelOutline();
    if (outline.isEmpty()) return;

    glColor4f(0.3f, 0.3f, 0.3f, 0.3f);
    glBegin(GL_LINE_LOOP);
    for (int i = 0; i <= 20; ++i) {
        double angle = (double)i / 20 * M_PI * 2;
        double x = cos(angle) * 5.0;
        double y = sin(angle) * 4.0;
        glVertex3f(x, y, 0);
    }
    glEnd();

    glColor4f(0.5f, 0.5f, 0.5f, 0.2f);
    glBegin(GL_LINES);
    for (double z = 0; z <= 50; z += 5.0) {
        for (int i = 0; i <= 20; ++i) {
            double angle = (double)i / 20 * M_PI * 2;
            double x = cos(angle) * 5.0;
            double y = sin(angle) * 4.0;
            glVertex3f(x, y, z);
            glVertex3f(x, y, z + 5);
        }
    }
    glEnd();
}

void Geological3DView::drawWaterBodies()
{
    if (!m_model) return;

    const auto& waterBodies = m_model->waterBodies();

    for (const auto& body : waterBodies) {
        if (body.vertices.isEmpty()) continue;

        bool shouldDraw = true;
        if (m_cutPlaneEnabled[0] || m_cutPlaneEnabled[1] || m_cutPlaneEnabled[2]) {
            QVector3D center = body.center;
            for (int i = 0; i < 3; ++i) {
                if (m_cutPlaneEnabled[i]) {
                    QVector3D normal;
                    normal[i] = 1.0;
                    QVector3D origin;
                    origin[i] = m_cutPlanePosition[i];
                    if (QVector3D::dotProduct(center - origin, normal) > 0) {
                        shouldDraw = false;
                        break;
                    }
                }
            }
        }

        if (!shouldDraw) continue;

        QColor c = body.color;
        glColor4f(c.red() / 255.0f, c.green() / 255.0f, c.blue() / 255.0f, c.alpha() / 255.0f);

        glBegin(GL_TRIANGLES);
        for (int i = 0; i < body.indices.size(); ++i) {
            int idx = body.indices[i];
            if (idx < body.vertices.size()) {
                const QVector3D& v = body.vertices[idx];
                glVertex3f(v.x(), v.y(), v.z());
            }
        }
        glEnd();

        glColor4f(0.8f, 0.1f, 0.1f, 0.8f);
        glLineWidth(1.0f);
        for (int i = 0; i < body.indices.size(); i += 3) {
            glBegin(GL_LINE_LOOP);
            for (int j = 0; j < 3; ++j) {
                int idx = body.indices[i + j];
                if (idx < body.vertices.size()) {
                    const QVector3D& v = body.vertices[idx];
                    glVertex3f(v.x(), v.y(), v.z());
                }
            }
            glEnd();
        }
    }
}

void Geological3DView::drawCutPlane(int index)
{
    double size = 50.0;
    double pos = m_cutPlanePosition[index];

    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glColor4f(0.5f, 0.7f, 1.0f, 0.3f);

    glBegin(GL_QUADS);
    if (index == 0) {
        glVertex3f(pos, -size/2, 0);
        glVertex3f(pos, size/2, 0);
        glVertex3f(pos, size/2, size);
        glVertex3f(pos, -size/2, size);
    } else if (index == 1) {
        glVertex3f(-size/2, pos, 0);
        glVertex3f(size/2, pos, 0);
        glVertex3f(size/2, pos, size);
        glVertex3f(-size/2, pos, size);
    } else {
        glVertex3f(-size/2, -size/2, pos);
        glVertex3f(size/2, -size/2, pos);
        glVertex3f(size/2, size/2, pos);
        glVertex3f(-size/2, size/2, pos);
    }
    glEnd();

    glColor4f(0.2f, 0.5f, 1.0f, 0.8f);
    glLineWidth(2.0f);
    glBegin(GL_LINE_LOOP);
    if (index == 0) {
        glVertex3f(pos, -size/2, 0);
        glVertex3f(pos, size/2, 0);
        glVertex3f(pos, size/2, size);
        glVertex3f(pos, -size/2, size);
    } else if (index == 1) {
        glVertex3f(-size/2, pos, 0);
        glVertex3f(size/2, pos, 0);
        glVertex3f(size/2, pos, size);
        glVertex3f(-size/2, pos, size);
    } else {
        glVertex3f(-size/2, -size/2, pos);
        glVertex3f(size/2, -size/2, pos);
        glVertex3f(size/2, size/2, pos);
        glVertex3f(-size/2, size/2, pos);
    }
    glEnd();
}

void Geological3DView::drawGrid()
{
    glColor4f(0.8f, 0.8f, 0.8f, 0.5f);
    glLineWidth(0.5f);
    glBegin(GL_LINES);

    for (float i = -10; i <= 10; i += 2) {
        glVertex3f(i, -8, 0);
        glVertex3f(i, -8, 50);
    }
    for (float i = 0; i <= 50; i += 5) {
        glVertex3f(-10, -8, i);
        glVertex3f(10, -8, i);
    }

    glEnd();
}
