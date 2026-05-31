import { colormap } from './api.js?v=2';
import { MarchingCubes } from './marchingCubes.js?v=2';

export class SceneManager {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.isosurface = null;
        this.wellMeshes = [];
        this.highRiskMeshes = [];
        this.cutPlane = null;
        this.cutPlaneData = null;
        this.cutPlaneTexture = null;
        this.cutPlaneCanvas = null;
        this.optimizationCandidates = [];
        this.injectionWellMeshes = [];
        this.injectionPlaceMode = false;
        this.bounds = [0, 100, 0, 100, 0, 20];
        this.marchingCubes = new MarchingCubes();
        this.threshold = 5;
        this.concentrationMin = 0;
        this.concentrationMax = 50;
        this.animationId = null;
        this.riskAnimationIds = new Map();
        this.candidateAnimationIds = new Map();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredObject = null;
        this._updateThrottle = null;
        this._pendingDispose = [];
        
        this.init();
        this.setupEventListeners();
        this.animate();
    }

    init() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0f);

        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
        this.camera.position.set(150, 120, 100);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 20;
        this.controls.maxDistance = 300;

        this.addLighting();
        this.addAxes();
        this.addSiteBounds();
    }

    addLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(100, 100, 100);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        this.scene.add(directionalLight);

        const pointLight1 = new THREE.PointLight(0x00d4ff, 0.5, 200);
        pointLight1.position.set(50, 50, 50);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0xff6b6b, 0.3, 150);
        pointLight2.position.set(-50, 30, 50);
        this.scene.add(pointLight2);
    }

    addAxes() {
        const axesHelper = new THREE.AxesHelper(15);
        this.scene.add(axesHelper);

        const gridHelper = new THREE.GridHelper(100, 10, 0x3a3a5a, 0x2a2a4a);
        gridHelper.position.y = -0.5;
        this.scene.add(gridHelper);
    }

    addSiteBounds() {
        const [xMin, xMax, yMin, yMax, zMin, zMax] = this.bounds;
        const geometry = new THREE.BoxGeometry(
            xMax - xMin,
            zMax - zMin,
            yMax - yMin
        );
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({ 
            color: 0x00d4ff, 
            transparent: true, 
            opacity: 0.5 
        });
        const lineSegments = new THREE.LineSegments(edges, lineMaterial);
        lineSegments.position.set(
            (xMin + xMax) / 2,
            (zMin + zMax) / 2,
            (yMin + yMax) / 2
        );
        this.scene.add(lineSegments);

        const groundGeometry = new THREE.PlaneGeometry(xMax - xMin, yMax - yMin);
        const groundMaterial = new THREE.MeshBasicMaterial({
            color: 0x1a1a2e,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set((xMin + xMax) / 2, zMin, (yMin + yMax) / 2);
        this.scene.add(ground);
    }

    _disposeMesh(mesh) {
        if (!mesh) return;
        this.scene.remove(mesh);
        if (mesh.geometry) {
            if (mesh.geometry.index) mesh.geometry.index = null;
            const posAttr = mesh.geometry.getAttribute('position');
            const normAttr = mesh.geometry.getAttribute('normal');
            if (posAttr && posAttr.array) posAttr.array = null;
            if (normAttr && normAttr.array) normAttr.array = null;
            mesh.geometry.dispose();
        }
        if (mesh.material) {
            if (mesh.material.map) {
                mesh.material.map.dispose();
                mesh.material.map = null;
            }
            mesh.material.dispose();
        }
    }

    _disposeCutPlaneResources() {
        if (this.cutPlaneTexture) {
            this.cutPlaneTexture.dispose();
            this.cutPlaneTexture = null;
        }
        if (this.cutPlaneCanvas) {
            this.cutPlaneCanvas = null;
        }
    }

    updateIsosurface(voxelData, dims, isoValue) {
        if (this.isosurface) {
            this._disposeMesh(this.isosurface);
            this.isosurface = null;
        }

        const bounds = [
            this.bounds[0], this.bounds[1],
            this.bounds[2], this.bounds[3],
            this.bounds[4], this.bounds[5]
        ];

        if (!voxelData || !dims || !bounds || voxelData.length === 0) {
            console.warn('Invalid data for isosurface generation');
            return;
        }

        const { vertices, normals, indices } = this.marchingCubes.generateIsosurface(
            voxelData, dims, bounds, isoValue
        );

        if (vertices.length === 0) return;

        const geometry = new THREE.BufferGeometry();
        const posArray = new Float32Array(vertices);
        const normArray = new Float32Array(normals);
        geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const material = new THREE.MeshPhongMaterial({
            color: 0x00d4ff,
            transparent: true,
            opacity: 0.6,
            shininess: 100,
            side: THREE.DoubleSide,
            wireframe: false
        });

        this.isosurface = new THREE.Mesh(geometry, material);
        this.isosurface.castShadow = true;
        this.isosurface.receiveShadow = true;
        this.scene.add(this.isosurface);
    }

    updateWells(wellData, showWells = true) {
        this.wellMeshes.forEach(mesh => this._disposeMesh(mesh));
        this.wellMeshes = [];

        if (!showWells) return;

        wellData.forEach(well => {
            const concentration = well.contaminants?.TCE || well.concentration || 0;
            
            const cylinderGeometry = new THREE.CylinderGeometry(0.8, 0.8, 2, 8);
            const color = new THREE.Color(colormap.getColor(concentration, 0, this.concentrationMax));
            const cylinderMaterial = new THREE.MeshPhongMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.3,
                shininess: 100
            });
            const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
            cylinder.position.set(well.x, well.z + 1, well.y);
            cylinder.userData = {
                type: 'well',
                wellId: well.well_id,
                concentration: concentration,
                waterLevel: well.water_level,
                temperature: well.temperature,
                pH: well.ph,
                conductivity: well.conductivity
            };
            this.scene.add(cylinder);
            this.wellMeshes.push(cylinder);

            const sphereGeometry = new THREE.SphereGeometry(0.6, 16, 16);
            const sphereMaterial = new THREE.MeshPhongMaterial({
                color: 0xff6b6b,
                emissive: 0xff6b6b,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: concentration > this.threshold ? 1 : 0.3
            });
            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphere.position.set(well.x, well.z + 2.5, well.y);
            sphere.userData = { type: 'well_marker', wellId: well.well_id };
            this.scene.add(sphere);
            this.wellMeshes.push(sphere);
        });
    }

    updateHighRiskRegions(highRiskRegions, showHighRisk = true) {
        this.riskAnimationIds.forEach((id) => cancelAnimationFrame(id));
        this.riskAnimationIds.clear();
        
        this.highRiskMeshes.forEach(mesh => this._disposeMesh(mesh));
        this.highRiskMeshes = [];

        if (!showHighRisk || !highRiskRegions) return;

        highRiskRegions.forEach((region, index) => {
            const size = Math.min(5 + region.voxel_count * 0.01, 15);
            const geometry = new THREE.SphereGeometry(size, 16, 16);
            const material = new THREE.MeshPhongMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.3,
                emissive: 0xff0000,
                emissiveIntensity: 0.5,
                wireframe: true
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(region.center[0], region.center[2], region.center[1]);
            mesh.userData = { type: 'high_risk', region: region };
            this.scene.add(mesh);
            this.highRiskMeshes.push(mesh);

            this._animateRiskRegion(mesh, index);
        });
    }

    _animateRiskRegion(mesh, index) {
        const tick = () => {
            if (!this.highRiskMeshes.includes(mesh)) return;
            
            const time = Date.now() * 0.003 + index;
            const scale = 1 + 0.3 * Math.sin(time);
            mesh.scale.set(scale, scale, scale);
            mesh.material.opacity = 0.2 + 0.2 * Math.sin(time);
            
            const id = requestAnimationFrame(tick);
            this.riskAnimationIds.set(index, id);
        };
        tick();
    }

    updateCutPlane(voxelData, dims, axis, position, showCutPlane = true) {
        this._disposeCutPlaneResources();
        if (this.cutPlane) {
            this._disposeMesh(this.cutPlane);
            this.cutPlane = null;
        }

        if (!showCutPlane) return;

        const [nx, ny, nz] = dims;
        const [xMin, xMax, yMin, yMax, zMin, zMax] = this.bounds;

        let planeData, width, height, normal, positionVec;
        const dx = (xMax - xMin) / (nx - 1);
        const dy = (yMax - yMin) / (ny - 1);
        const dz = (zMax - zMin) / (nz - 1);

        if (axis === 'x') {
            const ix = Math.floor(position / 100 * (nx - 1));
            planeData = new Float32Array(ny * nz);
            for (let j = 0; j < ny; j++) {
                for (let k = 0; k < nz; k++) {
                    const idx = ix + j * nx + k * nx * ny;
                    planeData[j + k * ny] = voxelData[idx] || 0;
                }
            }
            width = yMax - yMin;
            height = zMax - zMin;
            normal = new THREE.Vector3(1, 0, 0);
            positionVec = new THREE.Vector3(xMin + ix * dx, (zMin + zMax) / 2, (yMin + yMax) / 2);
        } else if (axis === 'y') {
            const iy = Math.floor(position / 100 * (ny - 1));
            planeData = new Float32Array(nx * nz);
            for (let i = 0; i < nx; i++) {
                for (let k = 0; k < nz; k++) {
                    const idx = i + iy * nx + k * nx * ny;
                    planeData[i + k * nx] = voxelData[idx] || 0;
                }
            }
            width = xMax - xMin;
            height = zMax - zMin;
            normal = new THREE.Vector3(0, 0, 1);
            positionVec = new THREE.Vector3((xMin + xMax) / 2, (zMin + zMax) / 2, yMin + iy * dy);
        } else {
            const iz = Math.floor(position / 100 * (nz - 1));
            planeData = new Float32Array(nx * ny);
            for (let i = 0; i < nx; i++) {
                for (let j = 0; j < ny; j++) {
                    const idx = i + j * nx + iz * nx * ny;
                    planeData[i + j * nx] = voxelData[idx] || 0;
                }
            }
            width = xMax - xMin;
            height = yMax - yMin;
            normal = new THREE.Vector3(0, 1, 0);
            positionVec = new THREE.Vector3((xMin + xMax) / 2, zMin + iz * dz, (yMin + yMax) / 2);
        }

        this.cutPlaneCanvas = document.createElement('canvas');
        const textureSize = 256;
        this.cutPlaneCanvas.width = textureSize;
        this.cutPlaneCanvas.height = textureSize;
        const ctx = this.cutPlaneCanvas.getContext('2d');
        const imageData = ctx.createImageData(textureSize, textureSize);

        const w = axis === 'x' ? ny : nx;
        const h = axis === 'z' ? ny : nz;

        for (let px = 0; px < textureSize; px++) {
            for (let py = 0; py < textureSize; py++) {
                const ix = Math.floor(px / textureSize * w);
                const iy = Math.floor(py / textureSize * h);
                const value = planeData[ix + iy * w] || 0;
                const color = colormap.getColorArray(value, this.concentrationMin, this.concentrationMax);
                const pixelIndex = (py * textureSize + px) * 4;
                imageData.data[pixelIndex] = color[0] * 255;
                imageData.data[pixelIndex + 1] = color[1] * 255;
                imageData.data[pixelIndex + 2] = color[2] * 255;
                imageData.data[pixelIndex + 3] = color[3] * 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        this.cutPlaneTexture = new THREE.CanvasTexture(this.cutPlaneCanvas);
        this.cutPlaneTexture.needsUpdate = true;

        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshBasicMaterial({
            map: this.cutPlaneTexture,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9
        });

        this.cutPlane = new THREE.Mesh(geometry, material);
        this.cutPlane.position.copy(positionVec);
        if (axis === 'x') {
            this.cutPlane.rotation.y = Math.PI / 2;
        } else if (axis === 'z') {
            this.cutPlane.rotation.x = Math.PI / 2;
        }
        this.scene.add(this.cutPlane);
    }

    showOptimizationCandidates(candidates) {
        this.candidateAnimationIds.forEach((id) => cancelAnimationFrame(id));
        this.candidateAnimationIds.clear();
        
        this.optimizationCandidates.forEach(mesh => this._disposeMesh(mesh));
        this.optimizationCandidates = [];

        candidates.forEach((candidate, index) => {
            const [x, y, z] = candidate;
            
            const geometry = new THREE.OctahedronGeometry(2, 0);
            const material = new THREE.MeshPhongMaterial({
                color: 0x00ff00,
                emissive: 0x00ff00,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.8
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, z, y);
            mesh.userData = { type: 'candidate', index: index, baseY: z };
            this.scene.add(mesh);
            this.optimizationCandidates.push(mesh);

            this._animateCandidate(mesh, index);
        });
    }

    _animateCandidate(mesh, index) {
        const tick = () => {
            if (!this.optimizationCandidates.includes(mesh)) return;
            
            const time = Date.now() * 0.002 + index * 0.5;
            mesh.rotation.y = time;
            mesh.position.y = mesh.userData.baseY + 0.5 * Math.sin(time);
            
            const id = requestAnimationFrame(tick);
            this.candidateAnimationIds.set(index, id);
        };
        tick();
    }

    setupEventListeners() {
        window.addEventListener('resize', () => {
            const width = this.container.clientWidth;
            const height = this.container.clientHeight;
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        });

        this.renderer.domElement.addEventListener('mousemove', (event) => {
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            
            this.handleHover(event);
        });

        this.renderer.domElement.addEventListener('click', (event) => {
            this.handleClick(event);
        });
    }

    handleHover(event) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const allMeshes = [
            ...this.wellMeshes, 
            ...this.highRiskMeshes, 
            ...this.optimizationCandidates,
            ...this.injectionWellMeshes
        ];
        const intersects = this.raycaster.intersectObjects(allMeshes);

        this.renderer.domElement.style.cursor = intersects.length > 0 ? 'pointer' : 'grab';

        const tooltip = document.getElementById('tooltip');
        const tooltipContent = document.getElementById('tooltip-content');

        if (intersects.length > 0) {
            const object = intersects[0].object;
            this.hoveredObject = object;

            if (object.userData.type === 'well') {
                const data = object.userData;
                tooltipContent.innerHTML = `
                    <strong>${data.wellId}</strong><br>
                    TCE浓度: ${data.concentration.toFixed(2)} μg/L<br>
                    水位: ${data.waterLevel.toFixed(1)} m<br>
                    温度: ${data.temperature.toFixed(1)} °C<br>
                    点击查看历史趋势
                `;
                tooltip.classList.remove('hidden');
                tooltip.style.left = (event.clientX + 15) + 'px';
                tooltip.style.top = (event.clientY + 15) + 'px';
            } else if (object.userData.type === 'high_risk') {
                const region = object.userData.region;
                tooltipContent.innerHTML = `
                    <strong>高风险区域</strong><br>
                    阈值: ${region.threshold.toFixed(1)} μg/L<br>
                    体积: ${region.volume.toFixed(1)} m³<br>
                    最大浓度: ${region.max_concentration.toFixed(2)} μg/L
                `;
                tooltip.classList.remove('hidden');
                tooltip.style.left = (event.clientX + 15) + 'px';
                tooltip.style.top = (event.clientY + 15) + 'px';
            } else if (object.userData.type === 'candidate') {
                tooltipContent.innerHTML = `
                    <strong>建议监测井 #${object.userData.index + 1}</strong><br>
                    点击显示详细信息
                `;
                tooltip.classList.remove('hidden');
                tooltip.style.left = (event.clientX + 15) + 'px';
                tooltip.style.top = (event.clientY + 15) + 'px';
            } else if (object.userData.type === 'injection_well') {
                const well = object.userData.well;
                const typeName = well.type === 'chemical_oxidation' ? '化学氧化' : '生物修复';
                tooltipContent.innerHTML = `
                    <strong>${well.well_id}</strong><br>
                    类型: ${typeName}<br>
                    药剂浓度: ${well.reagent_concentration.toFixed(0)} mg/L<br>
                    注入速率: ${well.injection_rate.toFixed(1)} m³/d<br>
                    点击编辑参数
                `;
                tooltip.classList.remove('hidden');
                tooltip.style.left = (event.clientX + 15) + 'px';
                tooltip.style.top = (event.clientY + 15) + 'px';
            } else {
                tooltip.classList.add('hidden');
            }
        } else {
            tooltip.classList.add('hidden');
            this.hoveredObject = null;
        }
    }

    handleClick(event) {
        if (this.injectionPlaceMode) {
            const position = this.placeInjectionWell(event);
            if (position) {
                window.dispatchEvent(new CustomEvent('place-injection-well', { detail: position }));
            }
            return;
        }
        
        if (this.hoveredObject) {
            if (this.hoveredObject.userData.type === 'well') {
                const wellId = this.hoveredObject.userData.wellId;
                window.dispatchEvent(new CustomEvent('well-click', { detail: { wellId } }));
            } else if (this.hoveredObject.userData.type === 'injection_well') {
                const well = this.hoveredObject.userData.well;
                window.dispatchEvent(new CustomEvent('injection-well-click', { detail: { well } }));
            }
        }
    }

    setThreshold(value) {
        this.threshold = value;
    }

    setConcentrationRange(min, max) {
        this.concentrationMin = min;
        this.concentrationMax = max;
    }

    setShowIsosurface(show) {
        if (this.isosurface) {
            this.isosurface.visible = show;
        }
    }

    setShowWells(show) {
        this.wellMeshes.forEach(mesh => {
            mesh.visible = show;
        });
    }

    setShowHighRisk(show) {
        this.highRiskMeshes.forEach(mesh => {
            mesh.visible = show;
        });
    }

    setShowCutPlane(show) {
        if (this.cutPlane) {
            this.cutPlane.visible = show;
        }
    }

    setInjectionPlaceMode(enabled) {
        this.injectionPlaceMode = enabled;
        this.renderer.domElement.style.cursor = enabled ? 'crosshair' : 'grab';
    }

    updateInjectionWells(injectionWells) {
        this.injectionWellMeshes.forEach(mesh => this._disposeMesh(mesh));
        this.injectionWellMeshes = [];

        injectionWells.forEach((well, index) => {
            const height = 3;
            const geometry = new THREE.ConeGeometry(1.2, height, 6);
            const color = well.type === 'chemical_oxidation' ? 0xff6b00 : 0x00ff88;
            const material = new THREE.MeshPhongMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.4,
                transparent: true,
                opacity: 0.8
            });
            const cone = new THREE.Mesh(geometry, material);
            cone.position.set(well.x, well.z + height / 2, well.y);
            cone.rotation.x = Math.PI;
            cone.userData = { type: 'injection_well', well: well, index: index };
            this.scene.add(cone);
            this.injectionWellMeshes.push(cone);

            const ringGeometry = new THREE.RingGeometry(1.5, 2.5, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.position.set(well.x, well.z + 0.1, well.y);
            ring.rotation.x = -Math.PI / 2;
            ring.userData = { type: 'injection_ring', wellId: well.well_id };
            this.scene.add(ring);
            this.injectionWellMeshes.push(ring);
        });
    }

    placeInjectionWell(screenPosition) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const x = ((screenPosition.x - rect.left) / rect.width) * 2 - 1;
        const y = -((screenPosition.y - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
        
        const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), -10);
        const intersect = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersect);
        
        if (intersect) {
            const [xMin, xMax, yMin, yMax, zMin, zMax] = this.bounds;
            return {
                x: Math.max(xMin, Math.min(xMax, intersect.x)),
                y: Math.max(yMin, Math.min(yMax, intersect.z)),
                z: Math.max(zMin, Math.min(zMax, -intersect.y))
            };
        }
        return null;
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.riskAnimationIds.forEach((id) => cancelAnimationFrame(id));
        this.riskAnimationIds.clear();
        this.candidateAnimationIds.forEach((id) => cancelAnimationFrame(id));
        this.candidateAnimationIds.clear();
        
        this._disposeMesh(this.isosurface);
        this.isosurface = null;
        this.wellMeshes.forEach(mesh => this._disposeMesh(mesh));
        this.wellMeshes = [];
        this.highRiskMeshes.forEach(mesh => this._disposeMesh(mesh));
        this.highRiskMeshes = [];
        this.optimizationCandidates.forEach(mesh => this._disposeMesh(mesh));
        this.optimizationCandidates = [];
        this.injectionWellMeshes.forEach(mesh => this._disposeMesh(mesh));
        this.injectionWellMeshes = [];
        this._disposeCutPlaneResources();
        this._disposeMesh(this.cutPlane);
        this.cutPlane = null;
        
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.forceContextLoss();
            this.container.removeChild(this.renderer.domElement);
        }
    }
}
