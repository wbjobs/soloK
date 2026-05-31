use crate::config::{Config, Environment, WoodSpecies};
use crate::pointcloud::{Point, PointCloud};
use ndarray::{Array2, Axis};
use rayon::prelude::*;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct DamageAnalysis {
    pub decay: DecayResult,
    pub insect: InsectResult,
    pub crack: CrackResult,
    pub overall_damage_score: f64,
}

#[derive(Debug, Clone)]
pub struct DecayResult {
    pub decayed_points: Vec<usize>,
    pub decay_volume_percent: f64,
    pub max_decay_depth: f64,
    pub avg_decay_depth: f64,
    pub decay_regions: Vec<DecayRegion>,
}

#[derive(Debug, Clone)]
pub struct DecayRegion {
    pub center: [f64; 3],
    pub volume: f64,
    pub severity: f64,
}

#[derive(Debug, Clone)]
pub struct InsectResult {
    pub hole_count: usize,
    pub hole_density: f64,
    pub clusters: Vec<HoleCluster>,
    pub avg_hole_radius: f64,
}

#[derive(Debug, Clone)]
pub struct HoleCluster {
    pub center: [f64; 3],
    pub hole_count: usize,
    pub radius: f64,
}

#[derive(Debug, Clone)]
pub struct CrackResult {
    pub crack_count: usize,
    pub cracks: Vec<Crack>,
    pub total_crack_length: f64,
    pub max_crack_width: f64,
    pub avg_crack_width: f64,
}

#[derive(Debug, Clone)]
pub struct Crack {
    pub start: [f64; 3],
    pub end: [f64; 3],
    pub length: f64,
    pub width: f64,
    pub plane_normal: [f64; 3],
}

impl DamageAnalysis {
    pub fn analyze(
        point_cloud: &PointCloud,
        config: &Config,
        _species: &WoodSpecies,
        env: &Environment,
    ) -> Self {
        let decay = Self::detect_decay(point_cloud, &config.decay, env);
        let insect = Self::detect_insect_damage(point_cloud, &config.insect);
        let crack = Self::detect_cracks(point_cloud, &config.crack);

        let decay_score = decay.decay_volume_percent * 2.0;
        let insect_score = (insect.hole_density * 100.0).min(30.0);
        let crack_score = (crack.total_crack_length / 1000.0 * 10.0).min(30.0);
        let overall_damage_score = (decay_score + insect_score + crack_score).min(100.0);

        Self {
            decay,
            insect,
            crack,
            overall_damage_score,
        }
    }

    fn detect_decay(
        point_cloud: &PointCloud,
        config: &crate::config::DecayConfig,
        env: &Environment,
    ) -> DecayResult {
        let env_factor = env.decay_factor();

        let decayed_points: Vec<usize> = point_cloud
            .points
            .par_iter()
            .enumerate()
            .filter(|(_, p)| {
                let color_check = if let (Some(r), Some(g), Some(b)) = (p.red, p.green, p.blue) {
                    r >= config.color_threshold_low[0]
                        && r <= config.color_threshold_high[0]
                        && g >= config.color_threshold_low[1]
                        && g <= config.color_threshold_high[1]
                        && b >= config.color_threshold_low[2]
                        && b <= config.color_threshold_high[2]
                } else {
                    false
                };

                let intensity_check = p
                    .intensity
                    .map(|i| i < config.intensity_threshold)
                    .unwrap_or(false);

                color_check || intensity_check
            })
            .map(|(i, _)| i)
            .collect();

        let decay_volume_percent = if !point_cloud.is_empty() {
            (decayed_points.len() as f64 / point_cloud.len() as f64 * 100.0) * env_factor
        } else {
            0.0
        };

        let decay_regions = Self::cluster_decay_regions(point_cloud, &decayed_points);

        let (max_depth, avg_depth) = if !decayed_points.is_empty() {
            let depths: Vec<f64> = decayed_points
                .iter()
                .map(|&i| {
                    let p = &point_cloud.points[i];
                    let mut min_dist = f64::INFINITY;
                    for (j, q) in point_cloud.points.iter().enumerate() {
                        if !decayed_points.contains(&j) {
                            min_dist = min_dist.min(p.distance(q));
                        }
                    }
                    min_dist
                })
                .collect();
            (
                depths.iter().cloned().fold(f64::NEG_INFINITY, f64::max),
                depths.iter().sum::<f64>() / depths.len() as f64,
            )
        } else {
            (0.0, 0.0)
        };

        DecayResult {
            decayed_points,
            decay_volume_percent,
            max_decay_depth: max_depth,
            avg_decay_depth: avg_depth,
            decay_regions,
        }
    }

    fn cluster_decay_regions(
        point_cloud: &PointCloud,
        decayed_points: &[usize],
    ) -> Vec<DecayRegion> {
        if decayed_points.is_empty() {
            return Vec::new();
        }

        let mut clusters: Vec<Vec<usize>> = Vec::new();
        let mut visited = HashMap::new();

        for &idx in decayed_points {
            if visited.contains_key(&idx) {
                continue;
            }

            let mut cluster = Vec::new();
            let mut stack = vec![idx];

            while let Some(current) = stack.pop() {
                if visited.contains_key(&current) {
                    continue;
                }
                visited.insert(current, true);
                cluster.push(current);

                let p = &point_cloud.points[current];
                for &neighbor in decayed_points {
                    if !visited.contains_key(&neighbor) {
                        let q = &point_cloud.points[neighbor];
                        if p.distance(q) < 50.0 {
                            stack.push(neighbor);
                        }
                    }
                }
            }

            if cluster.len() > 10 {
                clusters.push(cluster);
            }
        }

        clusters
            .iter()
            .map(|cluster| {
                let mut sum_x = 0.0;
                let mut sum_y = 0.0;
                let mut sum_z = 0.0;

                for &idx in cluster {
                    let p = &point_cloud.points[idx];
                    sum_x += p.x;
                    sum_y += p.y;
                    sum_z += p.z;
                }

                let n = cluster.len() as f64;
                DecayRegion {
                    center: [sum_x / n, sum_y / n, sum_z / n],
                    volume: n * 10.0,
                    severity: (cluster.len() as f64 / 100.0).min(1.0),
                }
            })
            .collect()
    }

    fn detect_insect_damage(
        point_cloud: &PointCloud,
        config: &crate::config::InsectConfig,
    ) -> InsectResult {
        let kdtree = kdtree::KdTree::new(3);
        for (i, p) in point_cloud.points.iter().enumerate() {
            kdtree.add(&[p.x, p.y, p.z], i).unwrap();
        }

        let mut hole_centers: Vec<[f64; 3]> = Vec::new();

        for (i, p) in point_cloud.points.iter().enumerate() {
            let nearby = kdtree
                .within(&[p.x, p.y, p.z], config.hole_radius_max)
                .unwrap();

            let count = nearby.len();
            let expected = (4.0 / 3.0 * std::f64::consts::PI * config.hole_radius_max.powi(3)) / 10.0;

            if (count as f64) < expected * 0.3 && count > 3 {
                let mut sum_x = 0.0;
                let mut sum_y = 0.0;
                let mut sum_z = 0.0;

                for (_, &idx) in &nearby {
                    let q = &point_cloud.points[idx];
                    sum_x += q.x;
                    sum_y += q.y;
                    sum_z += q.z;
                }

                let n = nearby.len() as f64;
                hole_centers.push([sum_x / n, sum_y / n, sum_z / n]);
            }
        }

        let hole_count = hole_centers.len();
        let volume = point_cloud.bounds.volume();
        let hole_density = if volume > 0.0 {
            hole_count as f64 / volume * 1_000_000.0
        } else {
            0.0
        };

        let clusters = Self::cluster_holes(&hole_centers, config.clustering_eps, config.min_cluster_size);

        let avg_hole_radius = (config.hole_radius_min + config.hole_radius_max) / 2.0;

        InsectResult {
            hole_count,
            hole_density,
            clusters,
            avg_hole_radius,
        }
    }

    fn cluster_holes(holes: &[[f64; 3]], eps: f64, min_size: usize) -> Vec<HoleCluster> {
        let mut clusters: Vec<HoleCluster> = Vec::new();
        let mut visited = vec![false; holes.len()];

        for i in 0..holes.len() {
            if visited[i] {
                continue;
            }

            let mut cluster_indices = vec![i];
            let mut stack = vec![i];
            visited[i] = true;

            while let Some(idx) = stack.pop() {
                for j in 0..holes.len() {
                    if !visited[j] {
                        let dist = ((holes[idx][0] - holes[j][0]).powi(2)
                            + (holes[idx][1] - holes[j][1]).powi(2)
                            + (holes[idx][2] - holes[j][2]).powi(2))
                        .sqrt();
                        if dist < eps {
                            visited[j] = true;
                            cluster_indices.push(j);
                            stack.push(j);
                        }
                    }
                }
            }

            if cluster_indices.len() >= min_size {
                let mut sum_x = 0.0;
                let mut sum_y = 0.0;
                let mut sum_z = 0.0;
                let mut max_dist = 0.0;

                for &idx in &cluster_indices {
                    sum_x += holes[idx][0];
                    sum_y += holes[idx][1];
                    sum_z += holes[idx][2];
                }

                let center_x = sum_x / cluster_indices.len() as f64;
                let center_y = sum_y / cluster_indices.len() as f64;
                let center_z = sum_z / cluster_indices.len() as f64;

                for &idx in &cluster_indices {
                    let dist = ((holes[idx][0] - center_x).powi(2)
                        + (holes[idx][1] - center_y).powi(2)
                        + (holes[idx][2] - center_z).powi(2))
                    .sqrt();
                    max_dist = max_dist.max(dist);
                }

                clusters.push(HoleCluster {
                    center: [center_x, center_y, center_z],
                    hole_count: cluster_indices.len(),
                    radius: max_dist,
                });
            }
        }

        clusters
    }

    fn detect_cracks(point_cloud: &PointCloud, config: &crate::config::CrackConfig) -> CrackResult {
        if point_cloud.len() < 10 {
            return CrackResult {
                crack_count: 0,
                cracks: Vec::new(),
                total_crack_length: 0.0,
                max_crack_width: 0.0,
                avg_crack_width: 0.0,
            };
        }

        let surface_normals = Self::compute_surface_normals(point_cloud, config.grain_k_neighbors);
        let wood_grain_dir = Self::estimate_wood_grain_direction(&surface_normals);

        let points_array = point_cloud.to_ndarray();
        let mut cracks = Vec::new();

        for _ in 0..config.ransac_iterations / 10 {
            if let Some(crack) = Self::ransac_crack_detection(&points_array, point_cloud, config) {
                if crack.length >= config.min_crack_length && crack.width <= config.max_crack_width {
                    if Self::is_true_crack(&crack, point_cloud, &wood_grain_dir, config) {
                        cracks.push(crack);
                    }
                }
            }
        }

        cracks.sort_by(|a, b| b.length.partial_cmp(&a.length).unwrap());
        cracks.dedup_by(|a, b| {
            let dist = ((a.start[0] - b.start[0]).powi(2)
                + (a.start[1] - b.start[1]).powi(2)
                + (a.start[2] - b.start[2]).powi(2))
            .sqrt();
            dist < 50.0
        });

        let crack_count = cracks.len();
        let total_crack_length = cracks.iter().map(|c| c.length).sum();
        let max_crack_width = cracks
            .iter()
            .map(|c| c.width)
            .fold(0.0, f64::max);
        let avg_crack_width = if crack_count > 0 {
            cracks.iter().map(|c| c.width).sum::<f64>() / crack_count as f64
        } else {
            0.0
        };

        CrackResult {
            crack_count,
            cracks,
            total_crack_length,
            max_crack_width,
            avg_crack_width,
        }
    }

    fn compute_surface_normals(point_cloud: &PointCloud, k_neighbors: usize) -> Vec<[f64; 3]> {
        let mut normals = Vec::with_capacity(point_cloud.len());
        let kdtree = kdtree::KdTree::new(3);
        
        for (i, p) in point_cloud.points.iter().enumerate() {
            kdtree.add(&[p.x, p.y, p.z], i).unwrap();
        }

        for p in &point_cloud.points {
            let neighbors: Vec<_> = kdtree
                .nearest(&[p.x, p.y, p.z], k_neighbors + 1, &f64::INFINITY)
                .unwrap()
                .into_iter()
                .skip(1)
                .map(|(_, &idx)| &point_cloud.points[idx])
                .collect();

            if neighbors.len() < 3 {
                normals.push([0.0, 0.0, 1.0]);
                continue;
            }

            let mut sum_x = 0.0;
            let mut sum_y = 0.0;
            let mut sum_z = 0.0;
            for n in &neighbors {
                sum_x += n.x;
                sum_y += n.y;
                sum_z += n.z;
            }
            let n = neighbors.len() as f64;
            let centroid = [sum_x / n, sum_y / n, sum_z / n];

            let mut cov = [[0.0; 3]; 3];
            for nb in &neighbors {
                let dx = nb.x - centroid[0];
                let dy = nb.y - centroid[1];
                let dz = nb.z - centroid[2];
                cov[0][0] += dx * dx;
                cov[0][1] += dx * dy;
                cov[0][2] += dx * dz;
                cov[1][1] += dy * dy;
                cov[1][2] += dy * dz;
                cov[2][2] += dz * dz;
            }
            cov[1][0] = cov[0][1];
            cov[2][0] = cov[0][2];
            cov[2][1] = cov[1][2];

            let normal = Self::smallest_eigenvector(&cov);
            normals.push(normal);
        }

        normals
    }

    fn smallest_eigenvector(cov: &[[f64; 3]; 3]) -> [f64; 3] {
        let a = cov[0][0];
        let b = cov[0][1];
        let c = cov[0][2];
        let d = cov[1][1];
        let e = cov[1][2];
        let f = cov[2][2];

        let trace = a + d + f;
        let det = a * (d * f - e * e) - b * (b * f - c * e) + c * (b * e - c * d);
        
        let v = [trace / 3.0; 3];
        let norm = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
        if norm > 1e-10 {
            [v[0] / norm, v[1] / norm, v[2] / norm]
        } else {
            [0.0, 0.0, 1.0]
        }
    }

    fn estimate_wood_grain_direction(normals: &[[f64; 3]]) -> [f64; 3] {
        if normals.is_empty() {
            return [1.0, 0.0, 0.0];
        }

        use statrs::statistics::Statistics;
        
        let mean_x = normals.iter().map(|n| n[0]).collect::<Vec<_>>().mean();
        let mean_y = normals.iter().map(|n| n[1]).collect::<Vec<_>>().mean();
        let mean_z = normals.iter().map(|n| n[2]).collect::<Vec<_>>().mean();

        let norm = (mean_x * mean_x + mean_y * mean_y + mean_z * mean_z).sqrt();
        if norm > 1e-10 {
            [mean_x / norm, mean_y / norm, mean_z / norm]
        } else {
            [1.0, 0.0, 0.0]
        }
    }

    fn is_true_crack(
        crack: &Crack,
        point_cloud: &PointCloud,
        wood_grain_dir: &[f64; 3],
        config: &crate::config::CrackConfig,
    ) -> bool {
        let crack_dir = [
            crack.end[0] - crack.start[0],
            crack.end[1] - crack.start[1],
            crack.end[2] - crack.start[2],
        ];
        let crack_norm = (crack_dir[0].powi(2) + crack_dir[1].powi(2) + crack_dir[2].powi(2)).sqrt();
        if crack_norm < 1e-6 {
            return false;
        }
        let crack_dir = [
            crack_dir[0] / crack_norm,
            crack_dir[1] / crack_norm,
            crack_dir[2] / crack_norm,
        ];

        let dot_product = (crack_dir[0] * wood_grain_dir[0]
            + crack_dir[1] * wood_grain_dir[1]
            + crack_dir[2] * wood_grain_dir[2])
        .abs();

        let aspect_ratio = crack.length / crack.width;

        let depth_variation = Self::measure_crack_depth(crack, point_cloud);

        let cross_dir_dot = (crack.plane_normal[0] * wood_grain_dir[0]
            + crack.plane_normal[1] * wood_grain_dir[1]
            + crack.plane_normal[2] * wood_grain_dir[2])
        .abs();

        let mut score = 0.0;
        
        if dot_product < 0.3 {
            score += 30.0;
        } else if dot_product < 0.5 {
            score += 15.0;
        } else if dot_product > config.grain_dir_threshold {
            return false;
        }

        if aspect_ratio > 20.0 {
            score += 25.0;
        } else if aspect_ratio > 10.0 {
            score += 15.0;
        } else if aspect_ratio < 3.0 {
            return false;
        }

        if depth_variation > config.distance_threshold * 1.5 {
            score += 25.0;
        } else if depth_variation < config.distance_threshold * 0.3 {
            return false;
        }

        if cross_dir_dot < 0.5 {
            score += 20.0;
        }

        score >= config.crack_min_score
    }

    fn measure_crack_depth(crack: &Crack, point_cloud: &PointCloud) -> f64 {
        let kdtree = kdtree::KdTree::new(3);
        for (i, p) in point_cloud.points.iter().enumerate() {
            kdtree.add(&[p.x, p.y, p.z], i).unwrap();
        }

        let midpoint = [
            (crack.start[0] + crack.end[0]) / 2.0,
            (crack.start[1] + crack.end[1]) / 2.0,
            (crack.start[2] + crack.end[2]) / 2.0,
        ];

        let nearby: Vec<_> = kdtree
            .within(&midpoint, crack.width * 2.0)
            .unwrap()
            .into_iter()
            .map(|(_, &idx)| &point_cloud.points[idx])
            .collect();

        if nearby.is_empty() {
            return 0.0;
        }

        let ab = [
            crack.end[0] - crack.start[0],
            crack.end[1] - crack.start[1],
            crack.end[2] - crack.start[2],
        ];
        let ab_sq = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
        
        let mut distances = Vec::new();
        for p in &nearby {
            let ap = [p.x - crack.start[0], p.y - crack.start[1], p.z - crack.start[2]];
            let t = if ab_sq > 1e-10 {
                (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / ab_sq
            } else {
                0.0
            };
            
            let proj = [
                crack.start[0] + t * ab[0],
                crack.start[1] + t * ab[1],
                crack.start[2] + t * ab[2],
            ];
            
            let dist = ((p.x - proj[0]).powi(2)
                + (p.y - proj[1]).powi(2)
                + (p.z - proj[2]).powi(2))
            .sqrt();
            distances.push(dist);
        }

        use statrs::statistics::Statistics;
        if distances.len() >= 2 {
            distances.std_dev()
        } else {
            0.0
        }
    }

    fn ransac_crack_detection(
        points: &Array2<f64>,
        pc: &PointCloud,
        config: &crate::config::CrackConfig,
    ) -> Option<Crack> {
        use rand::Rng;
        let mut rng = rand::thread_rng();

        if points.nrows() < 3 {
            return None;
        }

        let idx1 = rng.gen_range(0..points.nrows());
        let idx2 = rng.gen_range(0..points.nrows());
        let idx3 = rng.gen_range(0..points.nrows());

        let p1 = points.row(idx1);
        let p2 = points.row(idx2);
        let p3 = points.row(idx3);

        let v1 = &p2 - &p1;
        let v2 = &p3 - &p1;

        let normal = [
            v1[1] * v2[2] - v1[2] * v2[1],
            v1[2] * v2[0] - v1[0] * v2[2],
            v1[0] * v2[1] - v1[1] * v2[0],
        ];

        let norm = (normal[0].powi(2) + normal[1].powi(2) + normal[2].powi(2)).sqrt();
        if norm < 1e-6 {
            return None;
        }

        let normal = [normal[0] / norm, normal[1] / norm, normal[2] / norm];
        let d = -(normal[0] * p1[0] + normal[1] * p1[1] + normal[2] * p1[2]);

        let mut inliers = Vec::new();
        for i in 0..points.nrows() {
            let p = points.row(i);
            let dist = (normal[0] * p[0] + normal[1] * p[1] + normal[2] * p[2] + d).abs();
            if dist < config.distance_threshold {
                inliers.push(i);
            }
        }

        if inliers.len() < 20 {
            return None;
        }

        let (min_idx, max_idx) = inliers.iter().fold((inliers[0], inliers[0]), |(min, max), &i| {
            let p_min = &pc.points[min];
            let p_max = &pc.points[max];
            let p_i = &pc.points[i];
            
            let dist_min = p_i.distance(&pc.points[inliers[0]]);
            let dist_current_min = p_min.distance(&pc.points[inliers[0]]);
            let dist_current_max = p_max.distance(&pc.points[inliers[0]]);

            (
                if dist_min < dist_current_min { i } else { min },
                if dist_min > dist_current_max { i } else { max },
            )
        });

        let start = pc.points[min_idx].as_array();
        let end = pc.points[max_idx].as_array();
        let length = ((end[0] - start[0]).powi(2)
            + (end[1] - start[1]).powi(2)
            + (end[2] - start[2]).powi(2))
        .sqrt();

        Some(Crack {
            start,
            end,
            length,
            width: config.distance_threshold * 2.0,
            plane_normal: normal,
        })
    }

    pub fn get_damage_heatmap(&self, resolution: usize) -> Array2<f64> {
        let mut heatmap = Array2::zeros((resolution, resolution));
        
        let decay_contribution = self.decay.decay_volume_percent / 100.0;
        
        for i in 0..resolution {
            for j in 0..resolution {
                let dist_from_center = ((i as f64 - resolution as f64 / 2.0).powi(2)
                    + (j as f64 - resolution as f64 / 2.0).powi(2))
                .sqrt()
                    / (resolution as f64 / 2.0);
                
                heatmap[[i, j]] = decay_contribution * (1.0 - dist_from_center).max(0.0);
            }
        }

        for (i, region) in self.decay.decay_regions.iter().enumerate() {
            let cx = ((region.center[0] % 1.0) * resolution as f64) as usize;
            let cy = ((region.center[1] % 1.0) * resolution as f64) as usize;
            for di in 0..3 {
                for dj in 0..3 {
                    let ni = (cx + di + resolution - 1) % resolution;
                    let nj = (cy + dj + resolution - 1) % resolution;
                    heatmap[[ni, nj]] += region.severity * 0.1;
                }
            }
        }

        heatmap.mapv(|x| x.min(1.0))
    }
}
