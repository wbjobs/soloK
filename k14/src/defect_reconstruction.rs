use crate::damage::{CrackResult, DecayResult, InsectResult};
use crate::pointcloud::{Point, PointCloud};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct DefectMesh {
    pub vertices: Vec<[f64; 3]>,
    pub faces: Vec<[usize; 3]>,
    pub defect_type: DefectType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DefectType {
    Decay,
    InsectHole,
    Crack,
}

impl std::fmt::Display for DefectType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DefectType::Decay => write!(f, "decay"),
            DefectType::InsectHole => write!(f, "insect"),
            DefectType::Crack => write!(f, "crack"),
        }
    }
}

pub struct DefectReconstructor;

impl DefectReconstructor {
    pub fn extract_decay_mesh(
        pc: &PointCloud,
        decay: &DecayResult,
        simplify: bool,
    ) -> Option<DefectMesh> {
        if decay.decayed_points.is_empty() {
            return None;
        }

        let mut defect_points = Vec::new();
        for &idx in &decay.decayed_points {
            if let Some(p) = pc.points.get(idx) {
                defect_points.push([p.x, p.y, p.z]);
            }
        }

        if defect_points.len() < 4 {
            return None;
        }

        let vertices = if simplify && defect_points.len() > 500 {
            Self::simplify_points(&defect_points, 500)
        } else {
            defect_points
        };

        let faces = Self::generate_surface_mesh(&vertices);

        Some(DefectMesh {
            vertices,
            faces,
            defect_type: DefectType::Decay,
        })
    }

    pub fn extract_insect_mesh(
        pc: &PointCloud,
        insect: &InsectResult,
    ) -> Vec<DefectMesh> {
        let mut meshes = Vec::new();

        for (i, cluster) in insect.clusters.iter().enumerate() {
            let radius = cluster.radius.max(10.0);
            let center = cluster.center;

            let vertices = Self::generate_sphere_points(center, radius, 12);
            let faces = Self::generate_icosphere_faces(12);

            meshes.push(DefectMesh {
                vertices,
                faces,
                defect_type: DefectType::InsectHole,
            });
        }

        meshes
    }

    pub fn extract_crack_mesh(
        pc: &PointCloud,
        cracks: &CrackResult,
    ) -> Vec<DefectMesh> {
        let mut meshes = Vec::new();

        for (i, crack) in cracks.cracks.iter().enumerate() {
            let vertices = Self::generate_crack_points(crack.start, crack.end, crack.width, 8);
            let faces = Self::generate_crack_faces(8);

            meshes.push(DefectMesh {
                vertices,
                faces,
                defect_type: DefectType::Crack,
            });
        }

        meshes
    }

    fn simplify_points(points: &[[f64; 3]], target_count: usize) -> Vec<[f64; 3]> {
        if points.len() <= target_count {
            return points.to_vec();
        }

        let step = points.len() / target_count;
        points
            .iter()
            .step_by(step)
            .take(target_count)
            .cloned()
            .collect()
    }

    fn generate_surface_mesh(vertices: &[[f64; 3]]) -> Vec<[usize; 3]> {
        if vertices.len() < 4 {
            return Vec::new();
        }

        let centroid = Self::compute_centroid(vertices);
        let mut indexed: Vec<(usize, &[f64; 3])> = vertices.iter().enumerate().collect();

        indexed.sort_by(|a, b| {
            let da = (a.1[0] - centroid[0]).powi(2)
                + (a.1[1] - centroid[1]).powi(2)
                + (a.1[2] - centroid[2]).powi(2);
            let db = (b.1[0] - centroid[0]).powi(2)
                + (b.1[1] - centroid[1]).powi(2)
                + (b.1[2] - centroid[2]).powi(2);
            da.partial_cmp(&db).unwrap()
        });

        let mut faces = Vec::new();
        let n = indexed.len().min(100);

        for i in 2..n {
            faces.push([indexed[0].0, indexed[i - 1].0, indexed[i].0]);
        }

        for i in 0..n {
            let next = (i + 1) % n;
            let opp = (i + n / 2) % n;
            faces.push([indexed[i].0, indexed[next].0, indexed[opp].0]);
        }

        faces
    }

    fn compute_centroid(points: &[[f64; 3]]) -> [f64; 3] {
        let n = points.len() as f64;
        let mut sum = [0.0; 3];
        for p in points {
            sum[0] += p[0];
            sum[1] += p[1];
            sum[2] += p[2];
        }
        [sum[0] / n, sum[1] / n, sum[2] / n]
    }

    fn generate_sphere_points(center: [f64; 3], radius: f64, subdivisions: usize) -> Vec<[f64; 3]> {
        let mut points = Vec::new();
        let stacks = subdivisions;
        let slices = subdivisions * 2;

        for i in 0..=stacks {
            let phi = std::f64::consts::PI * i as f64 / stacks as f64;
            for j in 0..slices {
                let theta = 2.0 * std::f64::consts::PI * j as f64 / slices as f64;
                let x = center[0] + radius * phi.sin() * theta.cos();
                let y = center[1] + radius * phi.sin() * theta.sin();
                let z = center[2] + radius * phi.cos();
                points.push([x, y, z]);
            }
        }

        points
    }

    fn generate_icosphere_faces(subdivisions: usize) -> Vec<[usize; 3]> {
        let mut faces = Vec::new();
        let stacks = subdivisions;
        let slices = subdivisions * 2;

        for i in 0..stacks {
            for j in 0..slices {
                let current = i * slices + j;
                let next_j = (j + 1) % slices;
                let next_i = current + slices;

                faces.push([current, current + slices, next_i + next_j - slices]);
                faces.push([current, next_i + next_j - slices, current + 1 - (j + 1) / slices * slices]);
            }
        }

        faces
    }

    fn generate_crack_points(
        start: [f64; 3],
        end: [f64; 3],
        width: f64,
        segments: usize,
    ) -> Vec<[f64; 3]> {
        let mut points = Vec::new();
        let dir = [
            end[0] - start[0],
            end[1] - start[1],
            end[2] - start[2],
        ];
        let length = (dir[0].powi(2) + dir[1].powi(2) + dir[2].powi(2)).sqrt();

        if length < 1e-6 {
            return points;
        }

        let dir = [dir[0] / length, dir[1] / length, dir[2] / length];

        let perp1 = [
            -dir[1],
            dir[0],
            0.0,
        ];
        let p1_len = (perp1[0].powi(2) + perp1[1].powi(2) + perp1[2].powi(2)).sqrt();
        let perp1 = if p1_len > 1e-6 {
            [perp1[0] / p1_len, perp1[1] / p1_len, perp1[2] / p1_len]
        } else {
            [1.0, 0.0, 0.0]
        };

        let perp2 = [
            dir[1] * perp1[2] - dir[2] * perp1[1],
            dir[2] * perp1[0] - dir[0] * perp1[2],
            dir[0] * perp1[1] - dir[1] * perp1[0],
        ];

        for i in 0..=segments {
            let t = i as f64 / segments as f64;
            let center = [
                start[0] + t * dir[0] * length,
                start[1] + t * dir[1] * length,
                start[2] + t * dir[2] * length,
            ];

            for j in [-1.0, 1.0].iter() {
                let offset = width * 0.5 * j;
                points.push([
                    center[0] + perp1[0] * offset,
                    center[1] + perp1[1] * offset,
                    center[2] + perp1[2] * offset,
                ]);
            }

            for j in [-1.0, 1.0].iter() {
                let offset = width * 0.2 * j;
                points.push([
                    center[0] + perp2[0] * offset,
                    center[1] + perp2[1] * offset,
                    center[2] + perp2[2] * offset,
                ]);
            }
        }

        points
    }

    fn generate_crack_faces(segments: usize) -> Vec<[usize; 3]> {
        let mut faces = Vec::new();
        let points_per_segment = 4;

        for i in 0..segments {
            let base = i * points_per_segment;
            let next_base = base + points_per_segment;

            faces.push([base, next_base, base + 1]);
            faces.push([base + 1, next_base, next_base + 1]);
            faces.push([base + 2, next_base + 2, base + 3]);
            faces.push([base + 3, next_base + 2, next_base + 3]);
        }

        faces
    }
}

pub fn export_stl(mesh: &DefectMesh, path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    if mesh.vertices.is_empty() || mesh.faces.is_empty() {
        return Err("Empty mesh".into());
    }

    let mut file = BufWriter::new(File::create(path)?);

    writeln!(file, "solid timber_defect_{}", mesh.defect_type)?;

    for face in &mesh.faces {
        if face[0] >= mesh.vertices.len()
            || face[1] >= mesh.vertices.len()
            || face[2] >= mesh.vertices.len()
        {
            continue;
        }

        let v0 = mesh.vertices[face[0]];
        let v1 = mesh.vertices[face[1]];
        let v2 = mesh.vertices[face[2]];

        let normal = compute_normal(v0, v1, v2);

        writeln!(file, "  facet normal {:.6} {:.6} {:.6}", normal[0], normal[1], normal[2])?;
        writeln!(file, "    outer loop")?;
        writeln!(file, "      vertex {:.6} {:.6} {:.6}", v0[0], v0[1], v0[2])?;
        writeln!(file, "      vertex {:.6} {:.6} {:.6}", v1[0], v1[1], v1[2])?;
        writeln!(file, "      vertex {:.6} {:.6} {:.6}", v2[0], v2[1], v2[2])?;
        writeln!(file, "    endloop")?;
        writeln!(file, "  endfacet")?;
    }

    writeln!(file, "endsolid timber_defect_{}", mesh.defect_type)?;

    Ok(())
}

fn compute_normal(v0: [f64; 3], v1: [f64; 3], v2: [f64; 3]) -> [f64; 3] {
    let u = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    let v = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

    let nx = u[1] * v[2] - u[2] * v[1];
    let ny = u[2] * v[0] - u[0] * v[2];
    let nz = u[0] * v[1] - u[1] * v[0];

    let len = (nx * nx + ny * ny + nz * nz).sqrt();
    if len > 1e-10 {
        [nx / len, ny / len, nz / len]
    } else {
        [0.0, 0.0, 1.0]
    }
}

pub fn export_all_defects(
    pc: &PointCloud,
    decay: &DecayResult,
    insect: &InsectResult,
    cracks: &CrackResult,
    output_dir: &Path,
    base_name: &str,
) -> Result<Vec<std::path::PathBuf>, Box<dyn std::error::Error>> {
    let mut exported_files = Vec::new();

    std::fs::create_dir_all(output_dir)?;

    if let Some(decay_mesh) = DefectReconstructor::extract_decay_mesh(pc, decay, true) {
        let path = output_dir.join(format!("{}_decay.stl", base_name));
        export_stl(&decay_mesh, &path)?;
        exported_files.push(path);
    }

    let insect_meshes = DefectReconstructor::extract_insect_mesh(pc, insect);
    for (i, mesh) in insect_meshes.iter().enumerate() {
        let path = output_dir.join(format!("{}_insect_{}.stl", base_name, i));
        export_stl(mesh, &path)?;
        exported_files.push(path);
    }

    let crack_meshes = DefectReconstructor::extract_crack_mesh(pc, cracks);
    for (i, mesh) in crack_meshes.iter().enumerate() {
        let path = output_dir.join(format!("{}_crack_{}.stl", base_name, i));
        export_stl(mesh, &path)?;
        exported_files.push(path);
    }

    Ok(exported_files)
}
