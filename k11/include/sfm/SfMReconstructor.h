#pragma once

#include "core/DataTypes.h"
#include "core/Utils.h"
#include <opencv2/opencv.hpp>
#include <opencv2/features2d.hpp>
#include <memory>
#include <vector>
#include <map>
#include <set>

namespace Fossil3D {

struct Track {
    std::map<int, cv::Point2f> observations;
    cv::Point3f point3D;
    int id;
};

class SfMReconstructor {
public:
    SfMReconstructor();
    ~SfMReconstructor();

    void setFeatureType(const std::string& type);
    void setMaxFeatures(int maxFeatures);
    void setMatchingRatio(double ratio);

    bool loadImages(const std::vector<std::string>& imagePaths);
    bool detectFeatures();
    bool matchFeatures();
    bool initializeReconstruction();
    bool incrementReconstruction();
    bool runBA();
    bool reconstruct();

    PointCloudXYZRGB::Ptr getSparsePointCloud() const;
    std::vector<ImageData>& getImages() { return m_images; }
    const std::vector<ImageData>& getImages() const { return m_images; }
    const std::vector<Track>& getTracks() const { return m_tracks; }

    void saveReconstruction(const std::string& filename) const;
    bool loadReconstruction(const std::string& filename);

private:
    void computeIntrinsics(int imageIndex);
    bool findBasePair(int& idx1, int& idx2);
    bool initializeFromPair(int idx1, int idx2, cv::Mat& R, cv::Mat& t, 
                             std::vector<cv::Point3f>& points3D, 
                             std::vector<bool>& triangulatedMask);
    void triangulatePoints(int idx1, int idx2, const cv::Mat& R1, 
                           const cv::Mat& t1, const cv::Mat& R2, 
                           const cv::Mat& t2, const std::vector<cv::Point2f>& pts1,
                           const std::vector<cv::Point2f>& pts2, 
                           std::vector<cv::Point3f>& points3D,
                           std::vector<bool>& mask);
    double computeReprojectionError(const cv::Point3f& point3D, 
                                    const cv::Point2f& point2D,
                                    const cv::Mat& R, const cv::Mat& t, 
                                    const cv::Mat& K);
    void buildTracks();
    int findNextView();
    void addViewToReconstruction(int imageIdx);
    void triangulateNewPoints();
    void filterOutliers();
    void colorizePointCloud();

    std::string m_featureType;
    int m_maxFeatures;
    double m_matchingRatio;

    std::vector<ImageData> m_images;
    std::vector<std::vector<MatchPair>> m_matchMatrix;
    std::vector<Track> m_tracks;
    std::set<int> m_registeredImages;
    std::map<int, std::map<int, int>> m_featureToTrack;

    cv::Ptr<cv::Feature2D> m_detector;
    cv::Ptr<cv::DescriptorMatcher> m_matcher;

    PointCloudXYZRGB::Ptr m_sparseCloud;
};

}
