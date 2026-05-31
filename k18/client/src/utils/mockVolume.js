export function generateMockUltrasoundVolume(width = 256, height = 256, depth = 128) {
  const totalVoxels = width * height * depth;
  const data = new Uint8Array(totalVoxels);

  for (let z = 0; z < depth; z++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (z * height + y) * width + x;

        const centerX = width / 2;
        const centerY = height / 2;
        const centerZ = depth / 2;

        const dx = x - centerX;
        const dy = y - centerY;
        const dz = z - centerZ;

        const distFromCenter = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const axialDist = Math.sqrt(dx * dx + dy * dy);

        let value = 0;

        const cystX = width * 0.35;
        const cystY = height * 0.4;
        const cystZ = depth * 0.5;
        const cystDist = Math.sqrt(
          (x - cystX) ** 2 + (y - cystY) ** 2 + (z - cystZ) ** 2
        );
        if (cystDist < 30) {
          value = 30 + Math.random() * 20;
        }

        const stoneX = width * 0.65;
        const stoneY = height * 0.55;
        const stoneZ = depth * 0.4;
        const stoneDist = Math.sqrt(
          (x - stoneX) ** 2 + (y - stoneY) ** 2 + (z - stoneZ) ** 2
        );
        if (stoneDist < 15) {
          value = 220 + Math.random() * 35;
        }

        const organX = width * 0.5;
        const organY = height * 0.5;
        const organZ = depth * 0.5;
        const organDist = Math.sqrt(
          ((x - organX) / (width * 0.35)) ** 2 +
          ((y - organY) / (height * 0.3)) ** 2 +
          ((z - organZ) / (depth * 0.35)) ** 2
        );
        if (organDist < 1 && cystDist > 35 && stoneDist > 20) {
          value = 80 + Math.random() * 60;
        }

        const noise = Math.random() * 30;
        value = Math.min(255, Math.max(0, value + noise));

        if (axialDist > width * 0.45) {
          value = Math.max(0, value - (axialDist - width * 0.45) * 3);
        }

        data[idx] = value;
      }
    }
  }

  return {
    data,
    dimensions: { width, height, depth },
    voxelSpacing: { x: 0.5, y: 0.5, z: 1.0 },
    patientInfo: {
      name: '模拟患者',
      id: 'MOCK-001',
      studyDate: new Date().toISOString().split('T')[0],
    },
  };
}
