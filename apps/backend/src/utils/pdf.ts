import puppeteer, { Browser, PDFOptions } from 'puppeteer';

let browser: Browser | null = null;
let activeRenders = 0;
const MAX_CONCURRENT_RENDERS = 3;
const renderQueue: Array<() => void> = [];

async function acquireRenderSlot(): Promise<() => void> {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders++;
    return () => releaseRenderSlot();
  }
  return new Promise((resolve) => {
    renderQueue.push(() => {
      activeRenders++;
      resolve(() => releaseRenderSlot());
    });
  });
}

function releaseRenderSlot(): void {
  activeRenders--;
  if (renderQueue.length > 0) {
    const next = renderQueue.shift();
    if (next) next();
  }
}

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
      timeout: 30000,
    });
  }
  return browser;
}

export async function renderPdf(
  html: string,
  options?: PDFOptions,
): Promise<Buffer> {
  const release = await acquireRenderSlot();
  try {
    const b = await getBrowser();
    const page = await b.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    try {
      await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
        ...options,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    release();
  }
}

