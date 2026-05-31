class PopulationChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = canvasId;
      document.body.appendChild(this.canvas);
    }
    
    this.ctx = this.canvas.getContext('2d');
    
    this.width = 360;
    this.height = 160;
    this.padding = { top: 30, right: 60, bottom: 25, left: 50 };
    
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    
    this.canvas.style.position = 'absolute';
    this.canvas.style.bottom = '20px';
    this.canvas.style.left = '20px';
    this.canvas.style.background = 'rgba(10, 10, 30, 0.85)';
    this.canvas.style.borderRadius = '8px';
    this.canvas.style.border = '1px solid rgba(100, 150, 255, 0.3)';
    this.canvas.style.zIndex = '100';
    this.canvas.style.pointerEvents = 'none';
    
    this.predatorColor = '#ff3322';
    this.preyColor = '#22dd55';
    this.gridColor = 'rgba(100, 150, 255, 0.15)';
    this.textColor = '#8899bb';
    this.labelColor = '#b0c4de';
  }
  
  draw(populationHistory, particleCount) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const p = this.padding;
    
    const chartW = w - p.left - p.right;
    const chartH = h - p.top - p.bottom;
    
    ctx.clearRect(0, 0, w, h);
    
    ctx.fillStyle = 'rgba(10, 10, 30, 0.9)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8);
    ctx.fill();
    
    const predData = populationHistory.predator;
    const preyData = populationHistory.prey;
    
    if (predData.length < 2) return;
    
    const maxVal = Math.max(
      particleCount,
      ...predData,
      ...preyData
    );
    
    ctx.strokeStyle = this.gridColor;
    ctx.lineWidth = 0.5;
    
    for (let i = 0; i <= 4; i++) {
      const y = p.top + (chartH * i / 4);
      ctx.beginPath();
      ctx.moveTo(p.left, y);
      ctx.lineTo(w - p.right, y);
      ctx.stroke();
      
      const val = Math.round(maxVal * (1 - i / 4));
      ctx.fillStyle = this.textColor;
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(val.toString(), p.left - 5, y + 3);
    }
    
    this.drawLine(preyData, maxVal, chartW, chartH, p, this.preyColor, 1.5);
    this.drawLine(predData, maxVal, chartW, chartH, p, this.predatorColor, 1.5);
    
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.labelColor;
    ctx.fillText('种群数量变化', w / 2, 14);
    
    const legendY = h - 8;
    ctx.font = '9px sans-serif';
    
    ctx.fillStyle = this.predatorColor;
    ctx.fillRect(p.left, legendY - 6, 10, 6);
    ctx.fillStyle = this.labelColor;
    ctx.textAlign = 'left';
    ctx.fillText(`捕食者: ${predData[predData.length - 1] || 0}`, p.left + 14, legendY);
    
    ctx.fillStyle = this.preyColor;
    ctx.fillRect(p.left + 100, legendY - 6, 10, 6);
    ctx.fillStyle = this.labelColor;
    ctx.fillText(`猎物: ${preyData[preyData.length - 1] || 0}`, p.left + 114, legendY);
    
    ctx.fillStyle = this.textColor;
    ctx.textAlign = 'right';
    ctx.fillText('时间 →', w - p.right, legendY);
  }
  
  drawLine(data, maxVal, chartW, chartH, padding, color, lineWidth) {
    const ctx = this.ctx;
    const len = data.length;
    if (len < 2) return;
    
    const step = chartW / Math.max(len - 1, 1);
    
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    
    for (let i = 0; i < len; i++) {
      const x = padding.left + i * step;
      const y = padding.top + chartH * (1 - data[i] / maxVal);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    
    ctx.beginPath();
    ctx.strokeStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba');
    if (ctx.strokeStyle === color) {
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = color;
    }
    ctx.lineWidth = 0.5;
    
    for (let i = 0; i < len; i++) {
      const x = padding.left + i * step;
      const y = padding.top + chartH * (1 - data[i] / maxVal);
      
      if (i === 0) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, padding.top + chartH);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(padding.left + (len - 1) * step, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.08;
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

export default PopulationChart;
