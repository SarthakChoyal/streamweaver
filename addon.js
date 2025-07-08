const { addonBuilder } = require("stremio-addon-sdk");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

// --- Addon Manifest ---
const manifest = {
    "id": "community.streamweaver.generic-click",
    "version": "6.0.0", // The Generic Click Engine
    "catalogs": [],
    "resources": ["stream"],
    "types": ["movie", "series"],
    "logo": "https://iili.io/F000VTv.png",
    "background": "https://images.unsplash.com/photo-1460355976672-71c3f0a4bdac?q=80&w=1469&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    "name": "StreamWeaver",
    "description": "Uses a stealth, ad-blocking browser to perform a generic click, resolving protected streams.",
    "idPrefixes": ["tt"]
};

const builder = new addonBuilder(manifest);

// --- The Puppeteer Resolver (with generic click) ---
async function resolveStreamWithBrowser(embedUrl) {
    console.log("1. Launching stealth, ad-blocking browser...");
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        console.log("2. Navigating to embed URL:", embedUrl);
        await page.goto(embedUrl, { waitUntil: 'networkidle2' });

        console.log("3. Attempting to perform a generic click to play...");
        
        let clicked = false;
        // Prioritize clicking inside an iframe, as that's where the player usually is.
        const playerFrame = page.frames().find(frame => frame.url().includes('vidsrc.me'));
        
        if (playerFrame) {
            console.log("4. Found the player iframe. Clicking its 'body'...");
            // Clicking the 'body' of the iframe is the most reliable generic click.
            await playerFrame.click('body', { delay: 100 });
            clicked = true;
        } else {
            // Fallback if the specific iframe isn't found
            console.log("4b. Player iframe not found. Clicking the main page body as a fallback.");
            await page.click('body', { delay: 100 });
            clicked = true;
        }

        if (!clicked) {
            throw new Error("Failed to perform a generic click on the page.");
        }

        console.log("5. Waiting for stream to load after click...");
        const finalResponse = await page.waitForResponse(
            response => response.url().includes('.m3u8'),
            { timeout: 15000 }
        );
        
        const m3u8Link = finalResponse.url();
        console.log("6. SUCCESS! Intercepted .m3u8 network request:", m3u8Link);
        
        return m3u8Link;

    } catch (error) {
        console.error("Puppeteer resolver failed:", error.message);
        return null;
    } finally {
        if (browser) {
            console.log("7. Closing browser.");
            await browser.close();
        }
    }
}


// --- Stream Handler ---
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