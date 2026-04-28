class Graph {
  static coordinate(width, height, padX, padY, index, data, maxValue, dataPoint) {
    const drawWidth = width - (padX * 2);
    const drawHeight = height - (padY * 2);

    let barWidth = 0;
    if (dataPoint > 1) {
      barWidth = drawWidth / (dataPoint - 1);
    }

    const x = padX + (index * barWidth);
    const y = height - padY - ((data / maxValue) * drawHeight);

    return { x, y, barWidth, drawWidth, drawHeight };
  }

  static getValidIndexArray(dataPoint, maxPoint) {
    if (dataPoint <= 0) return [];
    if (dataPoint === 1) return [0];

    const step = Math.min(dataPoint, Math.max(2, maxPoint));
    const validIndexArray = [];

    for (let i = 0; i < step; i++) {
      const index = Math.round(i * (dataPoint - 1) / (step - 1))
      validIndexArray.push(index);
    }

    return validIndexArray;
  }

  static check(canvas, dataset, maxValue) {
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    if (!Array.isArray(dataset)) return false;
    if (typeof maxValue !== 'number' || maxValue <= 0) return false;

    let firstLen = null;

    const invalidDataset = dataset.some((line) => {
      if (!line || !Array.isArray(line.data)) return true;
      if (!firstLen) firstLen = line.data.length;
      else if (line.data.length !== firstLen) return true;

      const invalidLine = line.data.some((data) => {
        if (typeof data !== 'number' || data < 0) return true;
        if (data > maxValue) return true;
        return false;
      });

      if (invalidLine) return true;
      return false;
    });

    return !invalidDataset;
  }

  static defaultConfig = {
    canvas: {
      background: '#0a0a0a',
      padX: 40,
      padY: 40
    },
    grid: {
      lineWidth: 1,
      lineColor: '#333333',
      textSize: 12,
      textFont: 'monospace',
      textColor: '#333333',
      textFilter: (t) => t.toFixed(0),
      stepY: 5,
      stepX: 10,
      legendX: true,
      legendY: true,
      legendDx: 20,
      legendDy: -20,
      dynamicLineX: true,
      dynamicLineY: true,
      lineX: true,
      lineY: true
    },
    line: {
      width: 1,
      color: '#aaaaaa',
    },
    point: {
      textPadding: 5,
      textSize: 12,
      textColor: '#cccccc',
      textFont: 'monospace',
      textBackground: 'rgba(0, 0, 0, 0.6)',
      textDx: 5,
      textDy: -18,
      textFilter: (t) => t.toFixed(2),
      pointRadius: 4,
      pointColor: '#ffffff',
      dynamicPoint: true,
      drawPoint: true,
      drawText: true
    }
  }

  static getCustomConfig(key, line, globalConfig) {
    if (line[key] === false) return false;
    if (!line[key]) return globalConfig[key];
    return { ...(globalConfig[key] || {}), ...line[key] };
  }

  static getGlobalConfig(userConfig) {
    const normalize = (key) => {
      if (userConfig[key] === false) return false;
      return { ...this.defaultConfig[key], ...userConfig[key] };
    }

    return {
      ...this.defaultConfig, ...userConfig,
      canvas: normalize('canvas'),
      grid: normalize('grid'),
      line: normalize('line'),
      point: normalize('point')
    };
  }

  static drawGrid(ctx, width, height, padX, padY, maxValue, dataPoint, globalConfig) {
    const cfg = globalConfig.grid;
    if (!cfg) return;

    ctx.lineWidth = cfg.lineWidth;
    ctx.strokeStyle = cfg.lineColor;
    ctx.fillStyle = cfg.textColor;
    ctx.font = `${cfg.textSize}px ${cfg.textFont}`;
    ctx.textAlign = 'center';

    if (cfg.lineX || cfg.legendX || cfg.dynamicLineX) {
      const draw = (i) => {
        const x = this.coordinate(width, height, padX, padY, i, 0, maxValue, dataPoint).x;

        if (cfg.legendX) {
          ctx.fillText(i.toString(), x, height - padY + cfg.legendDx);
        }

        if (cfg.lineX) {
          ctx.beginPath();
          ctx.moveTo(x, padY);
          ctx.lineTo(x, height - padY);
          ctx.stroke();
        }
      };

      if (cfg.dynamicLineX) {
        const validIndexArray = this.getValidIndexArray(dataPoint, cfg.stepX);
        for (let i = 0; i < validIndexArray.length; i++) {
          draw(validIndexArray[i]);
        }
      } else {
        for (let i = 0; i < dataPoint; i++) {
          draw(i);
        }
      }
    }

    if (cfg.lineY || cfg.legendY || cfg.dynamicLineY) {
      const draw = (i) => {
        const y = this.coordinate(width, height, padX, padY, 0, i, maxValue, dataPoint).y;

        if (cfg.legendY) {
          ctx.fillText(cfg.textFilter(i), padX + cfg.legendDy, y + cfg.textSize / 2);
        }

        if (cfg.lineY) {
          const startX = this.coordinate(width, height, padX, padY, 0, 0, maxValue, dataPoint).x;
          const endX = this.coordinate(width, height, padX, padY, dataPoint - 1, 0, maxValue, dataPoint).x;
          ctx.beginPath();
          ctx.moveTo(startX, y);
          ctx.lineTo(endX, y);
          ctx.stroke();
        }
      };

      const maxValueInt = Math.round(maxValue) + 1;

      if (cfg.dynamicLineY) {
        const validIndexArray = this.getValidIndexArray(maxValueInt, cfg.stepY);
        for (let i = 0; i < validIndexArray.length; i++) {
          draw(validIndexArray[i]);
        }
      } else {
        for (let i = 0; i < maxValueInt; i++) {
          draw(i);
        }
      }
    }
  }

  static drawLine(ctx, dataset, width, height, padX, padY, maxValue, globalConfig) {
    for (let j = 0; j < dataset.length; j++) {
      const line = dataset[j];
      const dataPoint = line.data.length;

      const cfg = this.getCustomConfig('line', line, globalConfig);
      if (!cfg) continue;

      ctx.beginPath();

      for (let i = 0; i < dataPoint; i++) {
        const data = line.data[i];
        const { x, y } = this.coordinate(width, height, padX, padY, i, data, maxValue ,dataPoint);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = cfg.width;
      ctx.strokeStyle = cfg.color;
      ctx.stroke();
    }
  }

  static drawPoint(ctx, dataset, width, height, padX, padY, maxValue, globalConfig) {
    for (let j = 0; j < dataset.length; j++) {
      const line = dataset[j];
      const dataPoint = line.data.length;

      const cfg = this.getCustomConfig('point', line, globalConfig);
      if (!cfg) continue;

      const draw = (i) => {
        const data = line.data[i];
        const { x, y } = this.coordinate(width, height, padX, padY, i, data, maxValue, dataPoint);

        if (cfg.drawPoint) {
          ctx.fillStyle = cfg.pointColor;
          ctx.beginPath();
          ctx.arc(x, y, cfg.pointRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        if (cfg.drawText) {
          ctx.textAlign = 'left'
          ctx.font = `${cfg.textSize}px ${cfg.textFont}`;
          ctx.fillStyle = cfg.textBackground;

          const label = cfg.textFilter(data);
          const tm = ctx.measureText(label);

          let rectX = x + cfg.textDx;
          if (rectX + tm.width > width - padX) {
            rectX = x - tm.width - cfg.textDx;
          }

          let rectY = y + cfg.textDy;
          if (rectY < padY) rectY = padY;
          else if (rectY + cfg.textSize > height - padY) rectY = height - padY - cfg.textSize;

          const tpad = cfg.textPadding;
          ctx.fillRect(rectX - tpad, rectY - tpad, tm.width + tpad * 2, cfg.textSize + tpad * 2);
          ctx.fillStyle = cfg.textColor;
          ctx.textBaseline = 'top';
          ctx.fillText(label, rectX, rectY + 1);
        }
      }

      if (cfg.dynamicPoint) {
        const validIndexArray = this.getValidIndexArray(dataPoint, globalConfig.grid.stepX);
        for (let i = 0; i < validIndexArray.length; i++) {
          draw(validIndexArray[i]);
        }
      } else {
        for (let i = 0; i < dataPoint; i++) {
          draw(i);
        }
      }
    }
  }

  static draw(canvas, dataset, maxValue, userConfig = {}) {
    if (!this.check(canvas, dataset, maxValue)) return;

    const globalConfig = this.getGlobalConfig(userConfig);
    if (!globalConfig.canvas) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ctx = canvas.getContext('2d');
    const padX = globalConfig.canvas.padX;
    const padY = globalConfig.canvas.padY;
    const dataPoint = Math.max(...dataset.map((line) => line.data.length));

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    if (canvas.style.background !== globalConfig.canvas.background) {
      canvas.style.background = globalConfig.canvas.background;
    }

    ctx.clearRect(0, 0, width, height);
    this.drawGrid(ctx, width, height, padX, padY, maxValue, dataPoint, globalConfig);
    this.drawLine(ctx, dataset, width, height, padX, padY, maxValue, globalConfig);
    this.drawPoint(ctx, dataset, width, height, padX, padY, maxValue, globalConfig);
  }
}