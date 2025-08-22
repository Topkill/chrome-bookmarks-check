// 生成不同尺寸的图标
const sizes = [16, 32, 48, 128];

function drawIcon(size) {
  const canvasElement = document.getElementById('canvas');
  if (!(canvasElement instanceof HTMLCanvasElement)) {
    console.error('Could not find canvas element');
    return;
  }
  const canvas = canvasElement;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  // 清除画布
  ctx.clearRect(0, 0, size, size);

  // 绘制背景
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(1, '#764ba2');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // 绘制星星
  ctx.fillStyle = '#FFA500';
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = size / 16;

  const centerX = size / 2;
  const centerY = size / 2;
  const outerRadius = size * 0.35;
  const innerRadius = size * 0.15;

  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    // 外点
    const outerAngle = (Math.PI * 2 / 5) * i - Math.PI / 2;
    const outerX = centerX + Math.cos(outerAngle) * outerRadius;
    const outerY = centerY + Math.sin(outerAngle) * outerRadius;

    if (i === 0) {
      ctx.moveTo(outerX, outerY);
    } else {
      ctx.lineTo(outerX, outerY);
    }

    // 内点
    const innerAngle = outerAngle + Math.PI / 5;
    const innerX = centerX + Math.cos(innerAngle) * innerRadius;
    const innerY = centerY + Math.sin(innerAngle) * innerRadius;
    ctx.lineTo(innerX, innerY);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 转换为图片
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    document.body.appendChild(img);

    // 创建下载链接
    const a = document.createElement('a');
    a.href = url;
    a.download = `icon-${size}.png`;
    a.textContent = `下载 ${size}x${size}`;
    a.style.display = 'block';
    a.style.margin = '10px';
    document.body.appendChild(a);
  });
}

// 生成所有尺寸
document.addEventListener('DOMContentLoaded', () => {
    sizes.forEach(size => {
        // slight delay to ensure canvas is ready
        setTimeout(() => drawIcon(size), 100);
    });
});