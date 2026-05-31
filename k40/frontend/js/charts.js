import { colormap } from './api.js';

export class ChartManager {
    constructor() {
        this.margin = { top: 20, right: 20, bottom: 40, left: 60 };
    }

    drawTrendChart(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';
        
        const width = 560;
        const height = 320;
        const innerWidth = width - this.margin.left - this.margin.right;
        const innerHeight = height - this.margin.top - this.margin.bottom;
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);
        
        const g = svg.append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);
        
        const parseTime = d3.timeParse('%Y-%m-%dT%H:%M:%S');
        const parseTimeOffset = d3.timeParse('%Y-%m-%dT%H:%M:%S.%L');
        
        const parseDateTime = (ts) => {
            if (ts instanceof Date) return ts;
            let dt = parseTime(ts);
            if (!dt) dt = parseTimeOffset(ts);
            if (!dt) dt = new Date(ts);
            return dt;
        };
        
        const timestamps = data.timestamps.map(parseDateTime);
        const concentrations = data.tce_concentration || [];
        const waterLevels = data.water_level || [];
        const temperatures = data.temperature || [];
        
        const x = d3.scaleTime()
            .domain(d3.extent(timestamps))
            .range([0, innerWidth]);
        
        const y1 = d3.scaleLinear()
            .domain([0, d3.max(concentrations) * 1.1 || 10])
            .range([innerHeight, 0]);
        
        const y2 = d3.scaleLinear()
            .domain([d3.min(waterLevels) * 0.9 || 0, d3.max(waterLevels) * 1.1 || 10])
            .range([innerHeight, 0]);
        
        const xAxis = d3.axisBottom(x)
            .ticks(6)
            .tickFormat(d3.timeFormat('%m-%d %H:%M'));
        
        const yAxisLeft = d3.axisLeft(y1)
            .ticks(5);
        
        const yAxisRight = d3.axisRight(y2)
            .ticks(5);
        
        g.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(xAxis)
            .selectAll('text')
            .style('fill', '#a0a0c0')
            .style('font-size', '10px')
            .attr('transform', 'rotate(-45)')
            .style('text-anchor', 'end');
        
        g.append('g')
            .call(yAxisLeft)
            .selectAll('text')
            .style('fill', '#a0a0c0')
            .style('font-size', '11px');
        
        g.append('g')
            .attr('transform', `translate(${innerWidth},0)`)
            .call(yAxisRight)
            .selectAll('text')
            .style('fill', '#a0a0c0')
            .style('font-size', '11px');
        
        g.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -innerHeight / 2)
            .attr('y', -45)
            .attr('text-anchor', 'middle')
            .style('fill', '#00d4ff')
            .style('font-size', '12px')
            .text('TCE浓度 (μg/L)');
        
        g.append('text')
            .attr('transform', 'rotate(90)')
            .attr('x', innerHeight / 2)
            .attr('y', -innerWidth - 10)
            .attr('text-anchor', 'middle')
            .style('fill', '#4ade80')
            .style('font-size', '12px')
            .text('水位 (m)');
        
        const threshold = 5;
        g.append('line')
            .attr('x1', 0)
            .attr('x2', innerWidth)
            .attr('y1', y1(threshold))
            .attr('y2', y1(threshold))
            .style('stroke', '#ff6b6b')
            .style('stroke-dasharray', '5,5')
            .style('opacity', 0.7);
        
        g.append('text')
            .attr('x', innerWidth)
            .attr('y', y1(threshold) - 5)
            .attr('text-anchor', 'end')
            .style('fill', '#ff6b6b')
            .style('font-size', '10px')
            .text('修复目标值 5μg/L');
        
        const lineConcentration = d3.line()
            .x((d, i) => x(timestamps[i]))
            .y(d => y1(d))
            .curve(d3.curveMonotoneX);
        
        const lineWaterLevel = d3.line()
            .x((d, i) => x(timestamps[i]))
            .y(d => y2(d))
            .curve(d3.curveMonotoneX);
        
        g.append('path')
            .datum(concentrations)
            .attr('fill', 'none')
            .attr('stroke', '#00d4ff')
            .attr('stroke-width', 2)
            .attr('d', lineConcentration);
        
        const gradient = svg.append('defs')
            .append('linearGradient')
            .attr('id', 'areaGradient')
            .attr('x1', '0%')
            .attr('y1', '0%')
            .attr('x2', '0%')
            .attr('y2', '100%');
        
        gradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', '#00d4ff')
            .attr('stop-opacity', 0.3);
        
        gradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', '#00d4ff')
            .attr('stop-opacity', 0);
        
        const area = d3.area()
            .x((d, i) => x(timestamps[i]))
            .y0(innerHeight)
            .y1(d => y1(d))
            .curve(d3.curveMonotoneX);
        
        g.append('path')
            .datum(concentrations)
            .attr('fill', 'url(#areaGradient)')
            .attr('d', area);
        
        g.append('path')
            .datum(waterLevels)
            .attr('fill', 'none')
            .attr('stroke', '#4ade80')
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '3,3')
            .attr('d', lineWaterLevel);
        
        g.selectAll('.dot-concentration')
            .data(concentrations.filter((d, i) => i % Math.max(1, Math.floor(concentrations.length / 20)) === 0))
            .enter()
            .append('circle')
            .attr('class', 'dot-concentration')
            .attr('cx', (d, i) => x(timestamps[i * Math.max(1, Math.floor(concentrations.length / 20))]))
            .attr('cy', d => y1(d))
            .attr('r', 3)
            .attr('fill', d => d > threshold ? '#ff6b6b' : '#00d4ff')
            .attr('stroke', '#fff')
            .attr('stroke-width', 0.5);
        
        const legend = g.append('g')
            .attr('transform', `translate(${innerWidth - 150}, 10)`);
        
        legend.append('line')
            .attr('x1', 0)
            .attr('x2', 20)
            .attr('y1', 0)
            .attr('y2', 0)
            .attr('stroke', '#00d4ff')
            .attr('stroke-width', 2);
        
        legend.append('text')
            .attr('x', 25)
            .attr('y', 4)
            .style('fill', '#a0a0c0')
            .style('font-size', '11px')
            .text('TCE浓度');
        
        legend.append('line')
            .attr('x1', 0)
            .attr('x2', 20)
            .attr('y1', 20)
            .attr('y2', 20)
            .attr('stroke', '#4ade80')
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '3,3');
        
        legend.append('text')
            .attr('x', 25)
            .attr('y', 24)
            .style('fill', '#a0a0c0')
            .style('font-size', '11px')
            .text('水位');
        
        g.selectAll('.grid')
            .data(y1.ticks(5))
            .enter()
            .append('line')
            .attr('class', 'grid')
            .attr('x1', 0)
            .attr('x2', innerWidth)
            .attr('y1', d => y1(d))
            .attr('y2', d => y1(d))
            .style('stroke', '#2a2a4a')
            .style('stroke-width', 0.5);
    }

    drawColorbar(canvasId, min, max) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        
        const stops = 10;
        for (let i = 0; i <= stops; i++) {
            const value = min + (max - min) * (i / stops);
            const color = colormap.getColor(value, min, max);
            gradient.addColorStop(i / stops, color);
        }
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = '#a0a0c0';
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        
        const labels = 5;
        for (let i = 0; i <= labels; i++) {
            const value = min + (max - min) * (i / labels);
            const y = height - (height * i / labels);
            ctx.fillText(value.toFixed(0), width - 5, y + 3);
            
            ctx.beginPath();
            ctx.moveTo(width - 20, y);
            ctx.lineTo(width - 15, y);
            ctx.strokeStyle = '#a0a0c0';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    drawTimeline(containerId, timePoints, onSelect) {
        const container = document.getElementById(containerId);
        if (!container || !timePoints || timePoints.length === 0) return;
        
        const width = container.clientWidth;
        const height = 60;
        
        container.innerHTML = '';
        
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);
        
        const x = d3.scaleLinear()
            .domain([0, timePoints.length - 1])
            .range([10, width - 10]);
        
        const concentrations = timePoints.map(tp => {
            const wellData = tp.well_data || [];
            return d3.mean(wellData, w => w.concentration || 0);
        });
        
        const y = d3.scaleLinear()
            .domain([0, d3.max(concentrations) * 1.1 || 10])
            .range([height - 10, 10]);
        
        const line = d3.line()
            .x((d, i) => x(i))
            .y(d => y(d))
            .curve(d3.curveMonotoneX);
        
        svg.append('path')
            .datum(concentrations)
            .attr('fill', 'none')
            .attr('stroke', '#00d4ff')
            .attr('stroke-width', 1.5)
            .attr('d', line);
        
        const area = d3.area()
            .x((d, i) => x(i))
            .y0(height - 10)
            .y1(d => y(d))
            .curve(d3.curveMonotoneX);
        
        svg.append('path')
            .datum(concentrations)
            .attr('fill', '#00d4ff')
            .attr('opacity', 0.2)
            .attr('d', area);
        
        const brush = d3.brushX()
            .extent([[10, 5], [width - 10, height - 5]])
            .on('end', (event) => {
                if (!event.selection) return;
                const [x0, x1] = event.selection;
                const i0 = Math.round(x.invert(x0));
                const i1 = Math.round(x.invert(x1));
                if (onSelect) onSelect(i0, i1);
            });
        
        svg.append('g')
            .call(brush);
        
        const playhead = svg.append('circle')
            .attr('r', 6)
            .attr('fill', '#ff6b6b')
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .attr('cy', height / 2);
        
        return {
            updatePlayhead: (index) => {
                playhead.attr('cx', x(index));
            }
        };
    }
}
