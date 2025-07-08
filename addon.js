const { addonBuilder } = require("stremio-addon-sdk");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

// --- Addon Manifest ---
const manifest = {
    "id": "community.streamweaver.optimized",
    "version": "4.2.0", // Optimized Engine
    "catalogs": [],
    "resources": ["stream"],
    "types": ["movie", "series"],
    "logo": "https://iili.io/F000VTv.png",
    "background": "https://images.unsplash.com/photo-1460355976672-71c3f0a4bdac?q=80&w=1469&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    "name": "StreamWeaver",
    "description": "Uses a highly-optimized stealth browser to resolve protected streams in low-resource environments.",
    "idPrefixes": ["tt"]
};

const builder = new addonBuilder(manifest);

// --- Optimized Puppeteer Resolver ---
async function resolveStreamWithBrowser(embedUrl) {
    console.log("1. Launching optimized stealth browser...");
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            // These are crucial flags for running in a Docker container on a free server
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Use /tmp instead of /dev/shm, which is limited in Docker
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', // Makes it lighter on resources
                '--disable-gpu' // GPU hardware acceleration is not available in a container
            ]
        });
        const page = await browser.newPage();
        
        // --- KEY OPTIMIZATION: Block unnecessary resources ---
        // This stops images, fonts, and stylesheets from loading, saving a LOT of memory.
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        console.log("2. Navigating to embed URL:", embedUrl);
        // Set a longer timeout as low-resource servers can be slow.
        await page.goto(embedUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        console.log("3. Page loaded. Looking for player iframe...");
        // This logic is improved to wait for the frame to appear.
        const playerFrame = page.frames().find(frame => frame.url().includes('vidsrc.me') || frame.url().includes('vidsrc.pro'));

        if (playerFrame) {
            console.log("4. Found player iframe. Clicking its 'body' to trigger play...");
            await playerFrame.click('body', { delay: 100 });
        } else {
            console.log("4b. Player iframe not found. Clicking main page as fallback...");
            await page.click('body', { delay: 100 });
        }

        console.log("5. Waiting for the .m3u8 network request...");
        const finalResponse = await page.waitForResponse(
            response => response.url().includes('.m3u8'),
            { timeout: 20000 } // Wait up to 20 seconds for the stream to initialize
        );
        
        const m3u8Link = finalResponse.url();
        console.log("6. SUCCESS! Intercepted stream URL:", m3u8Link);
        
        return m3u8Link;

    } catch (error) {
        // Provide a more specific error message
        console.error(`Puppeteer resolver failed: ${error.message}`);
        return null;
    } finally {
        if (browser) {
            console.log("7. Closing browser.");
            await browser.close();
        }
    }
}


// --- Stream Handler (No changes needed here) ---
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
            title: `StreamWeaver`,
            behaviorHints: { "notWebReady": true }
        };
        return Promise.resolve({ streams: [stream] });
    }

    console.log(`Could not provide a stream for ${id}`);
    return Promise.resolve({ streams: [] });
});

module.exports = builder.getInterface();
