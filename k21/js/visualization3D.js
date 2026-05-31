class Visualization3D {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.cables = [];
        this.terrain = null;
        this.hotspotMarkers = [];
        this.alertMarkers = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.displayMode = 'temperature';
        this.autoRotate = false;
        this.showTerrain = true;
        this.onPointClick = null;
        this.onPointHover = null;
        
        this.pendingUpdate = null;
        this.lastUpdateTime = 0;
        this.updateThrottleInterval = 100;
        this.colorUpdateStep = 10;
        
        this.dischargeMarkers = [];
        this.densityMapMesh = null;
        this.showDischarge = true;
        this.showDensityHeatmap = false;
        
        this.init();
    }

    init() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a1a);
        this.scene.fog = new THREE.Fog(0x0a0a1a, 50, 200);

        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
        this.camera.position.set(0, 30, 50);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        if (typeof THREE.OrbitControls !== 'undefined') {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            this.controls.maxPolarAngle = Math.PI / 2.1;
            this.controls.minDistance = 10;
            this.controls.maxDistance = 150;
        }

        this.addLights();
        this.createTerrain();
        this.createCables();
        this.createColorBar();

        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.renderer.domElement.addEventListener('click', (e) => this.onMouseClick(e));
        window.addEventListener('resize', () => this.onResize());

        this.animate();
    }

    addLights() {
        const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);

        const pointLight1 = new THREE.PointLight(0x4488ff, 0.5, 100);
        pointLight1.position.set(-30, 20, -30);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0x4488ff, 0.3, 80);
        pointLight2.position.set(30, 15, 30);
        this.scene.add(pointLight2);
    }

    createTerrain() {
        const geometry = new THREE.PlaneGeometry(120, 60, 120, 60);
        const positions = geometry.attributes.position;

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = Math.sin(x * 0.1) * Math.cos(y * 0.15) * 2 +
                      Math.sin(x * 0.05 + y * 0.05) * 3 +
                      Math.random() * 0.3;
            positions.setZ(i, z);
        }

        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0x1a3a5c,
            roughness: 0.9,
            metalness: 0.1,
            side: THREE.DoubleSide,
            wireframe: false
        });

        this.terrain = new THREE.Mesh(geometry, material);
        this.terrain.rotation.x = -Math.PI / 2;
        this.terrain.receiveShadow = true;
        this.scene.add(this.terrain);

        const gridHelper = new THREE.GridHelper(120, 60, 0x2a4a6c, 0x1a3a5c);
        gridHelper.position.y = -0.1;
        this.scene.add(gridHelper);
    }

    createCables() {
        const cableConfigs = [
            { y: 0.5, color: 0xff6b6b, name: '电缆A', zOffset: 0 },
            { y: 0.3, color: 0x4ecdc4, name: '电缆B', zOffset: 1 },
            { y: 0.1, color: 0x45b7d1, name: '电缆C', zOffset: -1 },
            { y: -0.1, color: 0x96ceb4, name: '电缆D', zOffset: 2 }
        ];

        cableConfigs.forEach((config, index) => {
            const cable = this.createCableMesh(config, index);
            this.cables.push({
                ...config,
                mesh: cable,
                cableId: index
            });
            this.scene.add(cable);
        });
    }

    createCableMesh(config, cableId) {
        const points = [];
        const segments = 1000;
        const length = 100;

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const x = (t - 0.5) * length;
            const y = config.y + 
                     Math.sin(t * Math.PI * 2) * 0.5 +
                     Math.sin(t * Math.PI * 4) * 0.2;
            const z = config.zOffset + Math.sin(t * Math.PI * 3) * 0.3;
            points.push(new THREE.Vector3(x, y, z));
        }

        const curve = new THREE.CatmullRomCurve3(points);
        const tubeGeometry = new THREE.TubeGeometry(curve, 500, 0.15, 8, false);

        const colors = new Float32Array(tubeGeometry.attributes.position.count * 3);
        for (let i = 0; i < tubeGeometry.attributes.position.count; i++) {
            colors[i * 3] = 0.2;
            colors[i * 3 + 1] = 0.4;
            colors[i * 3 + 2] = 0.8;
        }
        tubeGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.7,
            metalness: 0.3
        });

        const mesh = new THREE.Mesh(tubeGeometry, material);
        mesh.castShadow = true;
        mesh.userData = { cableId, type: 'cable', curve };
        
        return mesh;
    }

    createColorBar() {
        const canvas = document.createElement('canvas');
        canvas.width = 30;
        canvas.height = 200;
        canvas.style.cssText = 'position:absolute;right:10px;top:10px;border-radius:4px;';
        this.container.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 200);
        
        gradient.addColorStop(0, 'rgb(255, 50, 50)');
        gradient.addColorStop(0.25, 'rgb(255, 200, 0)');
        gradient.addColorStop(0.5, 'rgb(100, 255, 100)');
        gradient.addColorStop(0.75, 'rgb(0, 200, 200)');
        gradient.addColorStop(1, 'rgb(0, 100, 255)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 30, 200);
        
        const labels = ['100°C', '80°C', '60°C', '40°C', '20°C'];
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        labels.forEach((label, i) => {
            ctx.fillText(label, 35, 8 + i * 48);
        });
    }

    updateCableColors(analysisResults) {
        const now = Date.now();
        if (now - this.lastUpdateTime < this.updateThrottleInterval) {
            this.pendingUpdate = analysisResults;
            return;
        }
        
        this.lastUpdateTime = now;
        this.pendingUpdate = null;
        
        this.cables.forEach((cable, cableId) => {
            if (!analysisResults[cableId]) return;
            
            const result = analysisResults[cableId];
            const geometry = cable.mesh.geometry;
            const colors = geometry.attributes.color;
            const prevColors = cable.mesh.userData.prevColors || new Float32Array(colors.count * 3);
            const currentTemp = cable.mesh.userData.currentTemp;
            const rates = result.rates;
            const dcr = result.dcr;
            
            const totalPoints = colors.count;
            const dataPoints = CONFIG.dts.totalPoints;
            const step = this.colorUpdateStep;
            const threshold = 0.02;
            
            for (let base = 0; base < totalPoints; base += step) {
                const t = base / totalPoints;
                const dataIndex = Math.floor(t * dataPoints);
                const clampedIndex = Math.min(dataIndex, dataPoints - 1);
                
                let color;
                if (this.displayMode === 'temperature') {
                    const temp = currentTemp ? currentTemp[clampedIndex] : 25;
                    color = getTemperatureColor(temp);
                } else if (this.displayMode === 'rate') {
                    const rate = rates ? rates[clampedIndex] : 0;
                    color = getRateColor(rate);
                } else {
                    const dcrFactor = Math.min(1, Math.max(0, (dcr - 500) / 500));
                    color = [
                        Math.floor(255 * dcrFactor),
                        Math.floor(200 * (1 - dcrFactor)),
                        Math.floor(100 + 155 * (1 - dcrFactor))
                    ];
                }
                
                const r = color[0] / 255;
                const g = color[1] / 255;
                const b = color[2] / 255;
                
                const colorChanged = 
                    Math.abs(prevColors[base * 3] - r) > threshold ||
                    Math.abs(prevColors[base * 3 + 1] - g) > threshold ||
                    Math.abs(prevColors[base * 3 + 2] - b) > threshold;
                
                if (colorChanged) {
                    const end = Math.min(base + step, totalPoints);
                    for (let i = base; i < end; i++) {
                        colors.setXYZ(i, r, g, b);
                        prevColors[i * 3] = r;
                        prevColors[i * 3 + 1] = g;
                        prevColors[i * 3 + 2] = b;
                    }
                }
            }
            
            cable.mesh.userData.prevColors = prevColors;
            colors.needsUpdate = true;
        });
    }

    updateTemperatureData(currentData) {
        this.cables.forEach((cable, cableId) => {
            if (currentData[cableId]) {
                cable.mesh.userData.currentTemp = currentData[cableId].temperatures;
            }
        });
    }

    updateHotspots(analysisResults) {
        this.hotspotMarkers.forEach(marker => this.scene.remove(marker));
        this.hotspotMarkers = [];
        
        analysisResults.forEach((result, cableId) => {
            const cable = this.cables[cableId];
            if (!cable) return;
            
            const curve = cable.mesh.userData.curve;
            
            result.hotspots.forEach(hotspot => {
                const startT = hotspot.start / CONFIG.dts.totalPoints;
                const endT = hotspot.end / CONFIG.dts.totalPoints;
                const midT = (startT + endT) / 2;
                
                const position = curve.getPoint(midT);
                
                const markerGeometry = new THREE.SphereGeometry(0.4, 16, 16);
                const markerMaterial = new THREE.MeshBasicMaterial({
                    color: hotspot.type === 'critical' ? 0xff0000 : 
                           hotspot.type === 'rate' ? 0xff6600 : 0xffff00,
                    transparent: true,
                    opacity: 0.8
                });
                
                const marker = new THREE.Mesh(markerGeometry, markerMaterial);
                marker.position.copy(position);
                marker.position.y += 0.5;
                marker.userData = { hotspot, cableId };
                
                this.hotspotMarkers.push(marker);
                this.scene.add(marker);
            });
        });
    }

    addAlertMarker(cableId, position, type) {
        const cable = this.cables[cableId];
        if (!cable) return;
        
        const curve = cable.mesh.userData.curve;
        const t = position / CONFIG.dts.totalPoints;
        const pos = curve.getPoint(t);
        
        const markerGeometry = new THREE.RingGeometry(0.5, 0.8, 32);
        const markerMaterial = new THREE.MeshBasicMaterial({
            color: type === 'critical' ? 0xff0000 : 0xff6600,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });
        
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.copy(pos);
        marker.position.y += 1;
        marker.rotation.x = -Math.PI / 2;
        marker.userData = { type, startTime: Date.now() };
        
        this.alertMarkers.push(marker);
        this.scene.add(marker);
        
        setTimeout(() => {
            const index = this.alertMarkers.indexOf(marker);
            if (index > -1) {
                this.scene.remove(marker);
                this.alertMarkers.splice(index, 1);
            }
        }, 5000);
    }

    onMouseMove(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const cableMeshes = this.cables.map(c => c.mesh);
        const intersects = this.raycaster.intersectObjects(cableMeshes);
        
        if (intersects.length > 0) {
            const point = intersects[0].point;
            const cableId = intersects[0].object.userData.cableId;
            const curve = intersects[0].object.userData.curve;
            
            let closestT = 0;
            let closestDist = Infinity;
            
            for (let t = 0; t <= 1; t += 0.001) {
                const p = curve.getPoint(t);
                const dist = p.distanceTo(point);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestT = t;
                }
            }
            
            const pointIndex = Math.floor(closestT * CONFIG.dts.totalPoints);
            
            if (this.onPointHover) {
                this.onPointHover(cableId, pointIndex, event.clientX, event.clientY);
            }
        } else {
            if (this.onPointHover) {
                this.onPointHover(null, null);
            }
        }
    }

    onMouseClick(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const cableMeshes = this.cables.map(c => c.mesh);
        const intersects = this.raycaster.intersectObjects(cableMeshes);
        
        if (intersects.length > 0) {
            const point = intersects[0].point;
            const cableId = intersects[0].object.userData.cableId;
            const curve = intersects[0].object.userData.curve;
            
            let closestT = 0;
            let closestDist = Infinity;
            
            for (let t = 0; t <= 1; t += 0.001) {
                const p = curve.getPoint(t);
                const dist = p.distanceTo(point);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestT = t;
                }
            }
            
            const pointIndex = Math.floor(closestT * CONFIG.dts.totalPoints);
            
            if (this.onPointClick) {
                this.onPointClick(cableId, pointIndex);
            }
        }
    }

    setDisplayMode(mode) {
        this.displayMode = mode;
    }

    setAutoRotate(enabled) {
        this.autoRotate = enabled;
        if (this.controls) {
            this.controls.autoRotate = enabled;
            this.controls.autoRotateSpeed = 0.5;
        }
    }

    setShowTerrain(show) {
        this.showTerrain = show;
        if (this.terrain) {
            this.terrain.visible = show;
        }
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        const time = Date.now() * 0.001;
        
        if (this.pendingUpdate && (Date.now() - this.lastUpdateTime >= this.updateThrottleInterval)) {
            this.updateCableColors(this.pendingUpdate);
        }
        
        this.hotspotMarkers.forEach((marker, i) => {
            marker.position.y += Math.sin(time * 3 + i) * 0.002;
            marker.scale.setScalar(1 + Math.sin(time * 5 + i) * 0.1);
        });
        
        this.alertMarkers.forEach((marker, i) => {
            const elapsed = (Date.now() - marker.userData.startTime) / 1000;
            marker.scale.setScalar(1 + elapsed * 0.3);
            marker.material.opacity = Math.max(0, 0.9 - elapsed * 0.2);
        });
        
        this.dischargeMarkers.forEach((marker, i) => {
            const elapsed = (Date.now() - marker.userData.startTime) / 1000;
            const pulse = Math.sin(time * 10 + i) * 0.2 + 0.8;
            marker.scale.setScalar(pulse * (1 - elapsed * 0.3));
            marker.material.opacity = Math.max(0, 0.8 - elapsed * 0.5);
        });
        
        if (this.controls) {
            this.controls.update();
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    addDischargeEvent(dischargeEvent, cableId = 0) {
        if (!this.showDischarge) return;
        
        const cable = this.cables[cableId];
        if (!cable) return;
        
        const curve = cable.mesh.userData.curve;
        const t = dischargeEvent.position / CONFIG.dts.totalPoints;
        const position = curve.getPoint(t);
        
        const size = Math.min(1, dischargeEvent.pCValue / 500) * 0.5 + 0.1;
        
        const geometry = new THREE.SphereGeometry(size, 16, 16);
        const color = this.getDischargeColor(dischargeEvent.pCValue);
        
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.9
        });
        
        const marker = new THREE.Mesh(geometry, material);
        marker.position.copy(position);
        marker.position.y += 0.8 + size;
        marker.userData = { 
            startTime: Date.now(), 
            event: dischargeEvent,
            cableId 
        };
        
        this.dischargeMarkers.push(marker);
        this.scene.add(marker);
        
        setTimeout(() => {
            const index = this.dischargeMarkers.indexOf(marker);
            if (index > -1) {
                this.scene.remove(marker);
                this.dischargeMarkers.splice(index, 1);
            }
        }, 3000);
    }

    getDischargeColor(pCValue) {
        if (pCValue > 800) return 0xff0000;
        if (pCValue > 500) return 0xff6600;
        if (pCValue > 200) return 0xffff00;
        if (pCValue > 100) return 0x00ff00;
        return 0x00ffff;
    }

    updateDensityHeatmap(densityMap, cableId = 0) {
        if (!this.showDensityHeatmap) {
            if (this.densityMapMesh) {
                this.scene.remove(this.densityMapMesh);
                this.densityMapMesh = null;
            }
            return;
        }
        
        const cable = this.cables[cableId];
        if (!cable) return;
        
        if (this.densityMapMesh) {
            this.scene.remove(this.densityMapMesh);
        }
        
        const curve = cable.mesh.userData.curve;
        const segments = 500;
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const dataIndex = Math.floor(t * CONFIG.dts.totalPoints);
            const density = densityMap[Math.min(dataIndex, densityMap.length - 1)] || 0;
            
            const position = curve.getPoint(t);
            const color = this.getDensityColor(density);
            
            positions.push(position.x, position.y + 0.3, position.z);
            colors.push(color.r / 255, color.g / 255, color.b / 255);
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            linewidth: 3,
            transparent: true,
            opacity: 0.8
        });
        
        this.densityMapMesh = new THREE.Line(geometry, material);
        this.scene.add(this.densityMapMesh);
    }

    getDensityColor(density) {
        if (density > 0.8) return { r: 255, g: 0, b: 0 };
        if (density > 0.6) return { r: 255, g: 100, b: 0 };
        if (density > 0.4) return { r: 255, g: 200, b: 0 };
        if (density > 0.2) return { r: 100, g: 255, b: 0 };
        return { r: 0, g: 255, b: 200 };
    }

    setShowDischarge(show) {
        this.showDischarge = show;
        if (!show) {
            this.dischargeMarkers.forEach(marker => {
                this.scene.remove(marker);
            });
            this.dischargeMarkers = [];
        }
    }

    setShowDensityHeatmap(show, densityMap = null) {
        this.showDensityHeatmap = show;
        if (show && densityMap) {
            this.updateDensityHeatmap(densityMap);
        } else if (!show && this.densityMapMesh) {
            this.scene.remove(this.densityMapMesh);
            this.densityMapMesh = null;
        }
    }

    destroy() {
        if (this.renderer) {
            this.renderer.dispose();
            this.container.removeChild(this.renderer.domElement);
        }
    }
}
