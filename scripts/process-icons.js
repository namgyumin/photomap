/* eslint-disable */
// 일회성: icons/ 의 ChatGPT 생성 PNG(체커보드 배경 baked)를
// 투명 배경 + 단색 아이콘으로 변환해 assets/icons/ 에 배치.
// 사용: node scripts/process-icons.js
const sharp = require('sharp')
const path = require('path')

const SRC = path.join(__dirname, '..', 'icons')
const OUT = path.join(__dirname, '..', 'assets', 'icons')

const JOBS = [
  { src: 'ChatGPT Image 2026년 6월 10일 오후 09_04_22 (1).png', out: 'chevron-up.png', color: [26, 26, 26] },
  { src: 'ChatGPT Image 2026년 6월 10일 오후 09_04_23 (2).png', out: 'star-filled.png', color: [251, 192, 45] },
  // star-empty 원본은 연회색이라 체커보드와 색이 겹침 → star-filled 의 마스크 재사용
  { src: 'ChatGPT Image 2026년 6월 10일 오후 09_04_23 (2).png', out: 'star-empty.png', color: [218, 220, 224] },
  { src: 'ChatGPT Image 2026년 6월 10일 오후 09_04_23 (4).png', out: 'camera.png', color: [154, 160, 166] },
  { src: 'ChatGPT Image 2026년 6월 10일 오후 09_04_30 (1).png', out: 'direction.png', color: [255, 255, 255] },
  { src: 'ChatGPT Image 2026년 6월 10일 오후 09_04_30 (2).png', out: 'navigate.png', color: [6, 75, 86] },
  { src: 'ChatGPT Image 2026년 6월 10일 오후 09_04_31 (3).png', out: 'phone.png', color: [6, 75, 86] },
  { src: 'ChatGPT Image 2026년 6월 10일 오후 09_04_31 (4).png', out: 'bookmark.png', color: [26, 26, 26] },
  { src: 'ChatGPT Image 2026년 6월 10일 오후 09_04_31 (5).png', out: 'bookmark-check.png', color: [6, 75, 86] },
  { src: 'ChatGPT Image 2026년 6월 10일 오후 09_04_31 (6).png', out: 'share.png', color: [26, 26, 26] },
  { src: 'ChatGPT Image 2026년 6월 10일 오후 09_04_32 (7).png', out: 'close.png', color: [26, 26, 26] },
  { src: 'ChatGPT Image 2026년 6월 10일 오후 09_04_32 (8).png', out: 'clock.png', color: [26, 26, 26] },
  { src: 'ChatGPT Image 2026년 6월 10일 오후 09_04_32 (9).png', out: 'chevron-down.png', color: [26, 26, 26] },
  { src: 'ChatGPT Image 2026년 6월 10일 오후 09_04_32 (10).png', out: 'chevron-right.png', color: [26, 26, 26] },
  // play-badge: 흰 아이콘이 흰 체커와 겹쳐 추출 불가 → skip (영상 인라인 자동재생이라 필수 아님)
]

const dist = (a, b) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)

// 코너 4곳 60x60 픽셀 히스토그램에서 체커보드 색 2개 추출
function checkerColors(data, w, h) {
  const counts = new Map()
  const sample = (x0, y0) => {
    for (let y = y0; y < y0 + 60; y++) {
      for (let x = x0; x < x0 + 60; x++) {
        const i = (y * w + x) * 4
        const key = `${data[i]},${data[i + 1]},${data[i + 2]}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  sample(0, 0)
  sample(w - 60, 0)
  sample(0, h - 60)
  sample(w - 60, h - 60)
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const c1 = sorted[0][0].split(',').map(Number)
  const c2 = (sorted.find(([k]) => dist(k.split(',').map(Number), c1) > 12) ?? sorted[0])[0]
    .split(',')
    .map(Number)
  return [c1, c2]
}

async function processOne(job) {
  const { data, info } = await sharp(path.join(SRC, job.src))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const [c1, c2] = checkerColors(data, w, h)

  const T = 70 // 체커 색과 이만큼 떨어져야 아이콘 픽셀로 인정
  const out = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const px = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]
    const d = Math.min(dist(px, c1), dist(px, c2))
    const alpha = Math.max(0, Math.min(255, Math.round(((d - 10) / T) * 255)))
    out[i * 4] = job.color[0]
    out[i * 4 + 1] = job.color[1]
    out[i * 4 + 2] = job.color[2]
    out[i * 4 + 3] = alpha
  }

  // 투명 여백 trim → 정사각 패딩 → 96px (표시 17~26px 의 3x 이상)
  const trimmed = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer()
  await sharp(trimmed)
    .trim({ threshold: 10 })
    .resize(84, 84, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 6, bottom: 6, left: 6, right: 6, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT, job.out))
  console.log(`✓ ${job.out}`)
}

;(async () => {
  for (const job of JOBS) await processOne(job)
  console.log('done')
})()
