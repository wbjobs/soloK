#ifndef THREEDPOSITION_H
#define THREEDPOSITION_H

struct ThreeDPosition {
    double x;
    double y;
    double z;

    ThreeDPosition() : x(0), y(0), z(0) {}
    ThreeDPosition(double x, double y, double z) : x(x), y(y), z(z) {}
};

#endif
