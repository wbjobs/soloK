use ndarray::{Array1, Array2, Axis};
use std::path::Path;
use std::fs::File;
use std::io::{BufReader, Read};

#[derive(Debug, Clone, Copy, Default)]
pub struct Point {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub intensity: Option<f64>,
    pub red: Option<u16>,
    pub green: Option<u16>,
    pub blue: Option<u16>,
}

impl Point {
    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Self {
            x,
            y,
            z,
            intensity: None,
            red: None,
            green: None,
            blue: None,
        }
    }

    pub fn with_intensity(mut self, intensity: f64) -> Self {
        self.intensity = Some(intensity);
        self
    }

    pub fn with_color(mut self, r: u16, g: u16, b: u16) -> Self {
        self.red = Some(r);
        self.green = Some(g);
        self.blue = Some(b);
        self
    }

    pub fn distance(&self, other: &Point) -> f64 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        let dz = self.z - other.z;
        (dx * dx + dy * dy + dz * dz).sqrt()
    }

    pub fn as_array(&self) -> [f64; 3] {
        [self.x, self.y, self.z]
    }
}

pub struct PointCloud {
    pub points: Vec<Point>,
    pub bounds: BoundingBox,
}

#[derive(Debug, Clone, Copy)]
pub struct BoundingBox {
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
    pub max_y: f64,
    pub min_z: f64,
    pub max_z: f64,
}

impl BoundingBox {
    pub fn volume(&self) -> f64 {
        (self.max_x - self.min_x)
            * (self.max_y - self.min_y)
            * (self.max_z - self.min_z)
    }

    pub fn dimensions(&self) -> (f64, f64, f64) {
        (
            self.max_x - self.min_x,
            self.max_y - self.min_y,
            self.max_z - self.min_z,
        )
    }
}

impl PointCloud {
    pub fn new(points: Vec<Point>) -> Self {
        let bounds = Self::compute_bounds(&points);
        Self { points, bounds }
    }

    fn compute_bounds(points: &[Point]) -> BoundingBox {
        if points.is_empty() {
            return BoundingBox {
                min_x: 0.0,
                max_x: 0.0,
                min_y: 0.0,
                max_y: 0.0,
                min_z: 0.0,
                max_z: 0.0,
            };
        }

        let mut min_x = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        let mut min_y = f64::INFINITY;
        let mut max_y = f64::NEG_INFINITY;
        let mut min_z = f64::INFINITY;
        let mut max_z = f64::NEG_INFINITY;

        for p in points {
            min_x = min_x.min(p.x);
            max_x = max_x.max(p.x);
            min_y = min_y.min(p.y);
            max_y = max_y.max(p.y);
            min_z = min_z.min(p.z);
            max_z = max_z.max(p.z);
        }

        BoundingBox {
            min_x,
            max_x,
            min_y,
            max_y,
            min_z,
            max_z,
        }
    }

    pub fn len(&self) -> usize {
        self.points.len()
    }

    pub fn is_empty(&self) -> bool {
        self.points.is_empty()
    }

    pub fn to_ndarray(&self) -> Array2<f64> {
        let mut arr = Array2::zeros((self.points.len(), 3));
        for (i, p) in self.points.iter().enumerate() {
            arr[[i, 0]] = p.x;
            arr[[i, 1]] = p.y;
            arr[[i, 2]] = p.z;
        }
        arr
    }

    pub fn filter<F>(&self, f: F) -> PointCloud
    where
        F: Fn(&Point) -> bool,
    {
        let filtered: Vec<Point> = self
            .points
            .iter()
            .filter(|p| f(p))
            .cloned()
            .collect();
        PointCloud::new(filtered)
    }
}

pub fn load_point_cloud(path: &Path) -> Result<PointCloud, Box<dyn std::error::Error>> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .ok_or("Unknown file extension")?
        .to_lowercase();

    match ext.as_str() {
        "las" | "laz" => load_las(path),
        "ply" => load_ply(path),
        _ => Err(format!("Unsupported file format: {}", ext).into()),
    }
}

fn load_las(path: &Path) -> Result<PointCloud, Box<dyn std::error::Error>> {
    let reader = las::Reader::from_path(path)?;
    let mut points = Vec::new();

    for point in reader.points() {
        let point = point?;
        let mut p = Point::new(point.x as f64, point.y as f64, point.z as f64);
        p.intensity = Some(point.intensity as f64);
        if let Some(color) = point.color {
            p = p.with_color(color.red, color.green, color.blue);
        }
        points.push(p);
    }

    Ok(PointCloud::new(points))
}

fn load_ply(path: &Path) -> Result<PointCloud, Box<dyn std::error::Error>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    
    let mut points = Vec::new();
    let mut header = String::new();
    let mut reader = reader;
    
    let mut line = String::new();
    let mut num_vertices = 0;
    let mut in_header = true;
    let mut has_x = false;
    let mut has_y = false;
    let mut has_z = false;
    let mut has_intensity = false;
    let mut has_red = false;
    let mut has_green = false;
    let mut has_blue = false;
    
    while in_header {
        line.clear();
        if reader.read_line(&mut line)? == 0 {
            break;
        }
        let trimmed = line.trim();
        if trimmed.starts_with("element vertex") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            num_vertices = parts[2].parse::<usize>().unwrap_or(0);
        }
        if trimmed.starts_with("property float") {
            if trimmed.contains("x") { has_x = true; }
            if trimmed.contains("y") { has_y = true; }
            if trimmed.contains("z") { has_z = true; }
            if trimmed.contains("intensity") { has_intensity = true; }
        }
        if trimmed.starts_with("property uchar") || trimmed.starts_with("property uint8") {
            if trimmed.contains("red") { has_red = true; }
            if trimmed.contains("green") { has_green = true; }
            if trimmed.contains("blue") { has_blue = true; }
        }
        if trimmed == "end_header" {
            in_header = false;
        }
        header.push_str(&line);
    }
    
    for _ in 0..num_vertices {
        line.clear();
        if reader.read_line(&mut line)? == 0 {
            break;
        }
        let parts: Vec<&str> = line.trim().split_whitespace().collect();
        if parts.len() >= 3 {
            let x = parts[0].parse::<f64>().unwrap_or(0.0);
            let y = parts[1].parse::<f64>().unwrap_or(0.0);
            let z = parts[2].parse::<f64>().unwrap_or(0.0);
            let mut p = Point::new(x, y, z);
            
            if has_intensity && parts.len() > 3 {
                p.intensity = Some(parts[3].parse::<f64>().unwrap_or(0.0));
            }
            
            if has_red && has_green && has_blue && parts.len() >= 6 {
                let r = parts[parts.len() - 3].parse::<u16>().unwrap_or(0);
                let g = parts[parts.len() - 2].parse::<u16>().unwrap_or(0);
                let b = parts[parts.len() - 1].parse::<u16>().unwrap_or(0);
                p = p.with_color(r, g, b);
            }
            
            points.push(p);
        }
    }

    Ok(PointCloud::new(points))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_point_distance() {
        let p1 = Point::new(0.0, 0.0, 0.0);
        let p2 = Point::new(3.0, 4.0, 0.0);
        assert_eq!(p1.distance(&p2), 5.0);
    }

    #[test]
    fn test_bounding_box() {
        let points = vec![
            Point::new(0.0, 0.0, 0.0),
            Point::new(2.0, 3.0, 4.0),
        ];
        let pc = PointCloud::new(points);
        assert_eq!(pc.bounds.volume(), 2.0 * 3.0 * 4.0);
    }
}
