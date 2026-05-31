#include "sfm/SfMReconstructor.h"
#include <opencv2/calib3d.hpp>
#include <pcl/io/pcd_io.h>
#include <fstream>
#include <unordered_map>
#include <tuple>

namespace Fossil3D {

SfMReconstructor::SfMReconstructor()
    : m_featureType("SIFT")
    , m_maxFeatures(8000)
    , m_matchingRatio(0.7)
    , m_sparseCloud(new PointCloudXYZRGB) {
    m_detector = cv::SIFT::create(m_maxFeatures);
    m_matcher = cv::DescriptorMatcher::create("BruteForce");
}

SfMReconstructor::~SfMReconstructor() {
}

void SfMReconstructor::setFeatureType(const std::string& type) {
    m_featureType = type;
    if (type == "SIFT") {
        m_detector = cv::SIFT::create(m_maxFeatures);
    } else if (type == "ORB") {
        m_detector = cv::ORB::create(m_maxFeatures);
    } else if (type == "AKAZE") {
        m_detector = cv::AKAZE::create();
    }
}

void SfMReconstructor::setMaxFeatures(int maxFeatures) {
    m_maxFeatures = maxFeatures;
    setFeatureType(m_featureType);
}

void SfMReconstructor::setMatchingRatio(double ratio) {
    m_matchingRatio = ratio;
}

bool SfMReconstructor::loadImages(const std::vector<std::string>& imagePaths) {
    Logger::info("Loading " + std::to_string(imagePaths.size()) + " images...");
    m_images.clear();
    
    for (size_t i = 0; i < imagePaths.size(); ++i) {
        ImageData imgData;
        imgData.filename = imagePaths[i];
        imgData.id = static_cast<int>(i);
        imgData.image = cv::imread(imagePaths[i]);
        
        if (imgData.image.empty()) {
            Logger::error("Failed to load image: " + imagePaths[i]);
            continue;
        }
        
        computeIntrinsics(static_cast<int>(i));
        m_images.push_back(imgData);
        
        if (i % 10 == 9) {
            Logger::info("Loaded " + std::to_string(i + 1) + " images");
        }
    }
    
    Logger::info("Successfully loaded " + std::to_string(m_images.size()) + " images");
    return !m_images.empty();
}

void SfMReconstructor::computeIntrinsics(int imageIndex) {
    ImageData& img = m_images[imageIndex];
    double focal = 1.2 * std::max(img.image.cols, img.image.rows);
    cv::Mat K = cv::Mat::eye(3, 3, CV_64F);
    K.at<double>(0, 0) = focal;
    K.at<double>(1, 1) = focal;
    K.at<double>(0, 2) = img.image.cols / 2.0;
    K.at<double>(1, 2) = img.image.rows / 2.0;
    
    img.camera.K = K;
    img.camera.distCoeffs = cv::Mat::zeros(5, 1, CV_64F);
    img.camera.focalLength = focal;
    img.camera.imageSize = img.image.size();
    img.camera.R = cv::Mat::eye(3, 3, CV_64F);
    img.camera.t = cv::Mat::zeros(3, 1, CV_64F);
}

bool SfMReconstructor::detectFeatures() {
    Logger::info("Detecting features...");
    Timer timer;
    
    for (size_t i = 0; i < m_images.size(); ++i) {
        cv::Mat gray;
        if (m_images[i].image.channels() == 3) {
            cv::cvtColor(m_images[i].image, gray, cv::COLOR_BGR2GRAY);
        } else {
            gray = m_images[i].image;
        }
        
        m_detector->detectAndCompute(gray, cv::noArray(), 
                                      m_images[i].keypoints, 
                                      m_images[i].descriptors);
        
        if (i % 5 == 4) {
            Logger::info("Image " + std::to_string(i + 1) + ": " + 
                        std::to_string(m_images[i].keypoints.size()) + " features");
        }
    }
    
    Logger::info("Feature detection completed in " + timer.elapsedString());
    return true;
}

bool SfMReconstructor::matchFeatures() {
    Logger::info("Matching features...");
    Timer timer;
    
    int n = static_cast<int>(m_images.size());
    m_matchMatrix.resize(n, std::vector<MatchPair>(n));
    
    #pragma omp parallel for
    for (int i = 0; i < n; ++i) {
        for (int j = i + 1; j < n; ++j) {
            if (m_images[i].descriptors.empty() || m_images[j].descriptors.empty()) {
                continue;
            }
            
            std::vector<std::vector<cv::DMatch>> knnMatches;
            m_matcher->knnMatch(m_images[i].descriptors, m_images[j].descriptors, 
                                 knnMatches, 2);
            
            std::vector<cv::DMatch> goodMatches;
            for (const auto& matchPair : knnMatches) {
                if (matchPair.size() >= 2 && 
                    matchPair[0].distance < m_matchingRatio * matchPair[1].distance) {
                    goodMatches.push_back(matchPair[0]);
                }
            }
            
            if (goodMatches.size() < 30) {
                continue;
            }
            
            MatchPair mp;
            mp.imageId1 = i;
            mp.imageId2 = j;
            mp.matches = goodMatches;
            
            for (const auto& m : goodMatches) {
                mp.points1.push_back(m_images[i].keypoints[m.queryIdx].pt);
                mp.points2.push_back(m_images[j].keypoints[m.trainIdx].pt);
            }
            
            cv::Mat mask;
            cv::findFundamentalMat(mp.points1, mp.points2, cv::FM_RANSAC, 1.0, 0.99, mask);
            
            std::vector<cv::DMatch> inlierMatches;
            std::vector<cv::Point2f> inlierPts1, inlierPts2;
            
            for (size_t k = 0; k < goodMatches.size(); ++k) {
                if (mask.at<uchar>(k)) {
                    inlierMatches.push_back(goodMatches[k]);
                    inlierPts1.push_back(mp.points1[k]);
                    inlierPts2.push_back(mp.points2[k]);
                }
            }
            
            if (inlierMatches.size() >= 20) {
                mp.matches = inlierMatches;
                mp.points1 = inlierPts1;
                mp.points2 = inlierPts2;
                m_matchMatrix[i][j] = mp;
            }
        }
    }
    
    Logger::info("Feature matching completed in " + timer.elapsedString());
    return true;
}

bool SfMReconstructor::findBasePair(int& idx1, int& idx2) {
    int bestCount = 0;
    idx1 = 0;
    idx2 = 1;
    
    int n = static_cast<int>(m_images.size());
    for (int i = 0; i < n; ++i) {
        for (int j = i + 1; j < n; ++j) {
            if (m_matchMatrix[i][j].matches.size() > bestCount) {
                bestCount = static_cast<int>(m_matchMatrix[i][j].matches.size());
                idx1 = i;
                idx2 = j;
            }
        }
    }
    
    Logger::info("Best pair: images " + std::to_string(idx1) + " and " + 
                 std::to_string(idx2) + " with " + std::to_string(bestCount) + " matches");
    return bestCount >= 30;
}

bool SfMReconstructor::initializeFromPair(int idx1, int idx2, cv::Mat& R, cv::Mat& t,
                                           std::vector<cv::Point3f>& points3D,
                                           std::vector<bool>& triangulatedMask) {
    const MatchPair& mp = m_matchMatrix[idx1][idx2];
    if (mp.matches.empty()) {
        return false;
    }
    
    cv::Mat K1 = m_images[idx1].camera.K;
    cv::Mat K2 = m_images[idx2].camera.K;
    
    std::vector<cv::Point2f> points1, points2;
    cv::undistortPoints(mp.points1, points1, K1, m_images[idx1].camera.distCoeffs);
    cv::undistortPoints(mp.points2, points2, K2, m_images[idx2].camera.distCoeffs);
    
    cv::Mat E = cv::findEssentialMat(points1, points2, 1.0, cv::Point2d(0, 0), cv::RANSAC);
    
    cv::Mat mask;
    int inliers = cv::recoverPose(E, points1, points2, R, t, 1.0, cv::Point2d(0, 0), mask);
    
    if (inliers < 30) {
        return false;
    }
    
    cv::Mat R1 = cv::Mat::eye(3, 3, CV_64F);
    cv::Mat t1 = cv::Mat::zeros(3, 1, CV_64F);
    
    std::vector<cv::Point2f> inlierPts1, inlierPts2;
    for (size_t i = 0; i < points1.size(); ++i) {
        if (mask.at<uchar>(i)) {
            inlierPts1.push_back(mp.points1[i]);
            inlierPts2.push_back(mp.points2[i]);
        }
    }
    
    triangulatePoints(idx1, idx2, R1, t1, R, t, inlierPts1, inlierPts2, 
                      points3D, triangulatedMask);
    
    m_images[idx1].camera.R = R1.clone();
    m_images[idx1].camera.t = t1.clone();
    m_images[idx2].camera.R = R.clone();
    m_images[idx2].camera.t = t.clone();
    
    m_registeredImages.insert(idx1);
    m_registeredImages.insert(idx2);
    
    Logger::info("Initialization: " + std::to_string(points3D.size()) + " points triangulated");
    return true;
}

void SfMReconstructor::triangulatePoints(int idx1, int idx2, 
                                          const cv::Mat& R1, const cv::Mat& t1,
                                          const cv::Mat& R2, const cv::Mat& t2,
                                          const std::vector<cv::Point2f>& pts1,
                                          const std::vector<cv::Point2f>& pts2,
                                          std::vector<cv::Point3f>& points3D,
                                          std::vector<bool>& mask) {
    cv::Mat P1(3, 4, CV_64F);
    cv::Mat P2(3, 4, CV_64F);
    
    R1.copyTo(P1(cv::Rect(0, 0, 3, 3)));
    t1.copyTo(P1(cv::Rect(3, 0, 1, 3)));
    P1 = m_images[idx1].camera.K * P1;
    
    R2.copyTo(P2(cv::Rect(0, 0, 3, 3)));
    t2.copyTo(P2(cv::Rect(3, 0, 1, 3)));
    P2 = m_images[idx2].camera.K * P2;
    
    cv::Mat points4D;
    cv::triangulatePoints(P1, P2, pts1, pts2, points4D);
    
    points3D.resize(pts1.size());
    mask.resize(pts1.size(), false);
    
    for (size_t i = 0; i < pts1.size(); ++i) {
        float w = points4D.at<float>(3, i);
        if (std::abs(w) > 1e-6) {
            cv::Point3f pt(points4D.at<float>(0, i) / w,
                          points4D.at<float>(1, i) / w,
                          points4D.at<float>(2, i) / w);
            
            cv::Mat pt3D = (cv::Mat_<double>(3, 1) << pt.x, pt.y, pt.z);
            cv::Mat ptCam1 = R1 * pt3D + t1;
            cv::Mat ptCam2 = R2 * pt3D + t2;
            
            if (ptCam1.at<double>(2) > 0 && ptCam2.at<double>(2) > 0) {
                points3D[i] = pt;
                mask[i] = true;
            }
        }
    }
}

double SfMReconstructor::computeReprojectionError(const cv::Point3f& point3D,
                                                   const cv::Point2f& point2D,
                                                   const cv::Mat& R, const cv::Mat& t,
                                                   const cv::Mat& K) {
    cv::Mat pt3D = (cv::Mat_<double>(3, 1) << point3D.x, point3D.y, point3D.z);
    cv::Mat ptCam = R * pt3D + t;
    
    double z = ptCam.at<double>(2);
    if (z < 1e-6) return 1e10;
    
    double x = ptCam.at<double>(0) / z;
    double y = ptCam.at<double>(1) / z;
    
    double fx = K.at<double>(0, 0);
    double fy = K.at<double>(1, 1);
    double cx = K.at<double>(0, 2);
    double cy = K.at<double>(1, 2);
    
    double u = fx * x + cx;
    double v = fy * y + cy;
    
    return std::sqrt(std::pow(u - point2D.x, 2) + std::pow(v - point2D.y, 2));
}

void SfMReconstructor::buildTracks() {
    m_tracks.clear();
    m_featureToTrack.clear();
    
    int n = static_cast<int>(m_images.size());
    for (int i = 0; i < n; ++i) {
        for (int j = i + 1; j < n; ++j) {
            const MatchPair& mp = m_matchMatrix[i][j];
            if (mp.matches.empty()) continue;
            
            for (size_t k = 0; k < mp.matches.size(); ++k) {
                int f1 = mp.matches[k].queryIdx;
                int f2 = mp.matches[k].trainIdx;
                
                int trackId = -1;
                if (m_featureToTrack[i].count(f1)) {
                    trackId = m_featureToTrack[i][f1];
                } else if (m_featureToTrack[j].count(f2)) {
                    trackId = m_featureToTrack[j][f2];
                } else {
                    trackId = static_cast<int>(m_tracks.size());
                    Track t;
                    t.id = trackId;
                    m_tracks.push_back(t);
                }
                
                m_tracks[trackId].observations[i] = mp.points1[k];
                m_tracks[trackId].observations[j] = mp.points2[k];
                m_featureToTrack[i][f1] = trackId;
                m_featureToTrack[j][f2] = trackId;
            }
        }
    }
    
    Logger::info("Built " + std::to_string(m_tracks.size()) + " tracks");
}

int SfMReconstructor::findNextView() {
    int bestView = -1;
    int bestCount = 0;
    
    int n = static_cast<int>(m_images.size());
    for (int i = 0; i < n; ++i) {
        if (m_registeredImages.count(i)) continue;
        
        int count = 0;
        for (const auto& track : m_tracks) {
            bool hasRegistered = false;
            for (const auto& obs : track.observations) {
                if (m_registeredImages.count(obs.first)) {
                    hasRegistered = true;
                    break;
                }
            }
            if (hasRegistered && track.observations.count(i)) {
                count++;
            }
        }
        
        if (count > bestCount) {
            bestCount = count;
            bestView = i;
        }
    }
    
    if (bestView >= 0) {
        Logger::info("Next view: image " + std::to_string(bestView) + 
                     " with " + std::to_string(bestCount) + " correspondences");
    }
    return bestView;
}

void SfMReconstructor::addViewToReconstruction(int imageIdx) {
    std::vector<cv::Point3f> points3D;
    std::vector<cv::Point2f> points2D;
    
    for (const auto& track : m_tracks) {
        if (track.observations.count(imageIdx)) {
            bool has3D = false;
            cv::Point3f pt3D;
            
            for (const auto& obs : track.observations) {
                if (m_registeredImages.count(obs.first)) {
                    has3D = true;
                    break;
                }
            }
            
            if (has3D) {
                points3D.push_back(track.point3D);
                points2D.push_back(track.observations.at(imageIdx));
            }
        }
    }
    
    if (points3D.size() < 10) {
        Logger::warning("Not enough points to register image " + std::to_string(imageIdx));
        return;
    }
    
    cv::Mat distCoeffs = cv::Mat::zeros(5, 1, CV_64F);
    cv::Mat rvec, tvec;
    
    std::vector<int> inliers;
    cv::solvePnPRansac(points3D, points2D, m_images[imageIdx].camera.K, 
                        distCoeffs, rvec, tvec, false, 100, 8.0, 0.99, inliers);
    
    if (inliers.size() < 10) {
        Logger::warning("PnP failed for image " + std::to_string(imageIdx));
        return;
    }
    
    cv::Mat R;
    cv::Rodrigues(rvec, R);
    
    m_images[imageIdx].camera.R = R;
    m_images[imageIdx].camera.t = tvec;
    m_registeredImages.insert(imageIdx);
    
    Logger::info("Registered image " + std::to_string(imageIdx) + 
                 " with " + std::to_string(inliers.size()) + " inliers");
}

void SfMReconstructor::triangulateNewPoints() {
    for (auto& track : m_tracks) {
        if (track.observations.size() < 2) continue;
        
        std::vector<int> registeredViews;
        for (const auto& obs : track.observations) {
            if (m_registeredImages.count(obs.first)) {
                registeredViews.push_back(obs.first);
            }
        }
        
        if (registeredViews.size() < 2) continue;
        
        int idx1 = registeredViews[0];
        int idx2 = registeredViews[1];
        
        cv::Mat R1 = m_images[idx1].camera.R;
        cv::Mat t1 = m_images[idx1].camera.t;
        cv::Mat R2 = m_images[idx2].camera.R;
        cv::Mat t2 = m_images[idx2].camera.t;
        
        std::vector<cv::Point2f> pts1 = {track.observations.at(idx1)};
        std::vector<cv::Point2f> pts2 = {track.observations.at(idx2)};
        
        std::vector<cv::Point3f> points3D;
        std::vector<bool> mask;
        triangulatePoints(idx1, idx2, R1, t1, R2, t2, pts1, pts2, points3D, mask);
        
        if (mask[0]) {
            track.point3D = points3D[0];
        }
    }
}

void SfMReconstructor::filterOutliers() {
    for (auto& track : m_tracks) {
        if (track.observations.empty()) continue;
        
        double meanError = 0;
        int count = 0;
        
        for (const auto& obs : track.observations) {
            if (!m_registeredImages.count(obs.first)) continue;
            
            const ImageData& img = m_images[obs.first];
            double error = computeReprojectionError(track.point3D, obs.second,
                                                     img.camera.R, img.camera.t,
                                                     img.camera.K);
            meanError += error;
            count++;
        }
        
        if (count > 0 && meanError / count > 10.0) {
            track.observations.clear();
        }
    }
}

void SfMReconstructor::colorizePointCloud() {
    m_sparseCloud->clear();
    
    for (const auto& track : m_tracks) {
        if (track.observations.empty()) continue;
        
        pcl::PointXYZRGB pt;
        pt.x = track.point3D.x;
        pt.y = track.point3D.y;
        pt.z = track.point3D.z;
        
        for (const auto& obs : track.observations) {
            if (m_registeredImages.count(obs.first)) {
                const cv::Mat& img = m_images[obs.first].image;
                cv::Point2f pt2D = obs.second;
                if (pt2D.x >= 0 && pt2D.x < img.cols && 
                    pt2D.y >= 0 && pt2D.y < img.rows) {
                    cv::Vec3b color = img.at<cv::Vec3b>(cv::Point2i(pt2D));
                    pt.r = color[2];
                    pt.g = color[1];
                    pt.b = color[0];
                    break;
                }
            }
        }
        
        m_sparseCloud->push_back(pt);
    }
    
    m_sparseCloud->width = m_sparseCloud->size();
    m_sparseCloud->height = 1;
    m_sparseCloud->is_dense = false;
}

bool SfMReconstructor::initializeReconstruction() {
    buildTracks();
    
    int idx1, idx2;
    if (!findBasePair(idx1, idx2)) {
        Logger::error("Failed to find a good image pair for initialization");
        return false;
    }
    
    cv::Mat R, t;
    std::vector<cv::Point3f> points3D;
    std::vector<bool> mask;
    
    if (!initializeFromPair(idx1, idx2, R, t, points3D, mask)) {
        Logger::error("Failed to initialize reconstruction from image pair");
        return false;
    }
    
    size_t trackIdx = 0;
    for (size_t i = 0; i < m_matchMatrix[idx1][idx2].matches.size(); ++i) {
        if (i < mask.size() && mask[i]) {
            int f1 = m_matchMatrix[idx1][idx2].matches[i].queryIdx;
            if (m_featureToTrack[idx1].count(f1)) {
                int trackId = m_featureToTrack[idx1][f1];
                if (trackId < static_cast<int>(m_tracks.size())) {
                    m_tracks[trackId].point3D = points3D[i];
                }
            }
        }
    }
    
    colorizePointCloud();
    Logger::info("Reconstruction initialized with " + 
                 std::to_string(m_sparseCloud->size()) + " points");
    return true;
}

bool SfMReconstructor::incrementReconstruction() {
    Logger::info("Starting incremental reconstruction...");
    Timer timer;
    
    while (true) {
        int nextView = findNextView();
        if (nextView < 0) break;
        
        addViewToReconstruction(nextView);
        triangulateNewPoints();
        filterOutliers();
    }
    
    colorizePointCloud();
    Logger::info("Incremental reconstruction completed in " + timer.elapsedString());
    Logger::info("Total registered images: " + std::to_string(m_registeredImages.size()));
    Logger::info("Total 3D points: " + std::to_string(m_sparseCloud->size()));
    return true;
}

bool SfMReconstructor::runBA() {
    Logger::info("Running bundle adjustment...");
    Logger::warning("Bundle adjustment not fully implemented - using simple filtering");
    filterOutliers();
    colorizePointCloud();
    return true;
}

bool SfMReconstructor::reconstruct() {
    Timer totalTimer;
    
    if (!detectFeatures()) return false;
    if (!matchFeatures()) return false;
    if (!initializeReconstruction()) return false;
    if (!incrementReconstruction()) return false;
    if (!runBA()) return false;
    
    Logger::info("SfM reconstruction completed in " + totalTimer.elapsedString());
    return true;
}

PointCloudXYZRGB::Ptr SfMReconstructor::getSparsePointCloud() const {
    return m_sparseCloud;
}

void SfMReconstructor::saveReconstruction(const std::string& filename) const {
    pcl::io::savePCDFileBinary(filename, *m_sparseCloud);
    Logger::info("Point cloud saved to: " + filename);
}

bool SfMReconstructor::loadReconstruction(const std::string& filename) {
    if (pcl::io::loadPCDFile(filename, *m_sparseCloud) < 0) {
        return false;
    }
    return true;
}

}
