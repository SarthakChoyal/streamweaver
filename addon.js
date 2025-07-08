const { addonBuilder } = require("stremio-addon-sdk");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
// NEW: Import the adblocker plugin
const AdblockerPlugin = require("puppeteer-extra-plugin-adblocker");

// NEW: Tell puppeteer to use both plugins
puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true })); // blockTrackers is a good option

// --- Addon Manifest ---
const manifest = {
    "id": "community.streamweaver.adblock",
    "version": "6.0.0", // The Ad-Blocking Engine
    "catalogs": [],
    "resources": ["stream"],
    "types": ["movie", "series"],
    "logo": "https://iili.io/F000VTv.png",
    "background": "https://images.unsplash.com/photo-1460355976672-71c3f0a4bdac?q=80&w=1469&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    "name": "StreamWeaver",
    "description": "Uses a stealth, ad-blocking browser with smart frame-finding to resolve protected streams.",
    "idPrefixes": ["tt"]
};

const builder = new addonBuilder(manifest);

// --- The Ad-Blocking Puppeteer Resolver ---
async function resolveStreamWithBrowser(embedUrl) {
    console.log("1. Launching stealth, AD-BLOCKING browser..."); // Updated log message
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        });
        const page = await browser.newPage();
        
        // We no longer need the manual request interception, the adblocker handles it!
        // This makes the code cleaner.

        console.log("2. Navigating to embed URL:", embedUrl);
        await page.goto(embedUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        console.log("3. Page loaded. Waiting for the player iframe (#videoIframe) to appear...");
        const iframeSelector = 'iframe#videoIframe';
        await page.waitForSelector(iframeSelector, { timeout: 15000 });
        
        console.log("4. Iframe selector found! Getting a handle to the frame content...");
        const iframeElement = await page.$(iframeSelector);
        const playerFrame = await iframeElement.contentFrame();

        if (playerFrame) {
            console.log("5. Successfully attached to iframe. Clicking its 'body' to trigger play...");
            await playerFrame.click('body', { delay: 200 });
        } else {
            throw new Error("Found iframe element but could not attach to its content frame.");
        }

        console.log("6. Waiting for the .m3u8 network request...");
        const finalResponse = await page.waitForResponse(
            response => response.url().includes('.m3u8'),
            { timeout: 20000 }
        );
        
        const m3u8Link = finalResponse.url();
        console.log("7. SUCCESS! Intercepted stream URL:", m3u8Link);
        
        return m3u8Link;

    } catch (error) {
        console.error(`Puppeteer resolver failed: ${error.message}`);
        return null;
    } finally {
        if (browser) {
            console.log("8. Closing browser.");
            await browser.close();
        }
    }
}


// --- Stream Handler (No changes needed) ---
builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`Request for streams: ${type} ${id}`);
    let embedUrl;
    if (type === 'movie') {
        embedUrl = `https://vidsrc.icu/embed/movie/${id}`;
    } else if (type === 'series') {
        const [imdbId, season, episode] = id.split(':');
        embedUrl = `https://vidsrc.icu/embed/tv/${imdbId}/${season}/${episode}`;
    }

    if (!embedUrl) return Promise.resolve({ streams: [] });
    const streamUrl = await resolveStreamWithBrowser(embedUrl);

    if (streamUrl) {
        const stream = {
            url: streamUrl,
            title: `StreamWeaver - Adblock`,
            behaviorHints: { "notWebReady": true }
        };
        return Promise.resolve({ streams: [stream] });
    }

    console.log(`Could not provide a stream for ${id}`);
    return Promise.resolve({ streams: [] });
});

module.exports = builder.getInterface();