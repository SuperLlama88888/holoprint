import { lazyLoadAsyncFunctionFactory, max, sleep } from "./utils.js";

export default {
	vanillaData: createLazyCachingFetcher("VanillaDataFetcher", "Mojang", "bedrock-samples", "v1.21.120.22-preview"),
	bedrockData: createLazyCachingFetcher("BedrockData", "pmmp", "BedrockData", "6.0.0+bedrock-1.21.100"),
	bedrockBlockUpgradeSchema: createLazyCachingFetcher("BlockUpgrader", "SuperLlama88888", "BedrockBlockUpgradeSchema", "5.1.0+bedrock-1.21.60")
};

const GITHUB_CDN = "https://cdn.jsdelivr.net/gh";
const CHANGED_FILES_URL = `${GITHUB_CDN}/SuperLlama88888/holoprint-repository-tracker/lists`;
const CACHE_URL_PREFIX = "https://cache/";
const BAD_STATUS_CODES = [429, 500, 502, 503];

/**
 * @param {Parameters<typeof createCachingFetcher>} args
 */
function createLazyCachingFetcher(...args) {
	return lazyLoadAsyncFunctionFactory(createCachingFetcher, ...args);
}

/**
 * @param {string} name Internal cache name
 * @param {string} owner GitHub repository owner
 * @param {string} repo GitHub repository name
 * @param {string} version GitHub tag
 */
async function createCachingFetcher(name, owner, repo, version) {
	let cacheName = `${name}@${version}`;
	let baseUrl = `${GITHUB_CDN}/${owner}/${repo}@${version}`;
	let patchUrl = `${CHANGED_FILES_URL}/${owner}/${repo}`;
	let cache = await caches.open(cacheName);
	
	let oldCacheNames = (await caches.keys()).filter(c => (c.startsWith(`${name}@`) || c.startsWith(`${name}_`)) && c != cacheName);
	let sortedOldCacheNames = sortVersions(oldCacheNames);
	sortedOldCacheNames.slice(0, -1).forEach(cacheName => caches.delete(cacheName)); // delete old caches except the most recent one
	let prevCacheName = sortedOldCacheNames.at(-1); // if not found in the current cache, we look at this cache
	let prevCacheVersion = prevCacheName?.slice(prevCacheName.replace("_", "@").indexOf("@") + 1);
	let prevCache = prevCacheName && await caches.open(prevCacheName);
	if(!(await prevCache?.keys())?.length) {
		caches.delete(prevCacheName);
		prevCacheName = undefined;
		prevCache = undefined;
	}
	prevCacheName && console.debug(`${cacheName} will load old files from ${prevCacheName}`);
	
	let changedFilesTxt = prevCacheName && await cache.match("https://metadata/changedFilesTxt").then(res => res?.text());
	if(prevCacheName && !changedFilesTxt) {
		let changedFilesUrl = `${patchUrl}/${prevCacheVersion}_to_${version}.txt`;
		console.debug(`Loading changed files from ${changedFilesUrl}`);
		changedFilesTxt = await fetch(changedFilesUrl).then(res => {
			if(res?.ok) {
				return res.text();
			} else {
				console.error(`Failed to load changed files list from ${changedFilesUrl}`);
				return "";
			}
		});
		cache.put("https://metadata/changedFilesTxt", new Response(changedFilesTxt));
	}
	let changedFiles = new Set(changedFilesTxt?.split("\n"));
	
	/**
	 * Fetches a file, checking first against cache.
	 * @param {string} filename
	 * @returns {Promise<Response>}
	 */
	return async filename => {
		let fullUrl = `${baseUrl}/${filename}`;
		let cacheLink = CACHE_URL_PREFIX + filename;
		let res = await cache.match(cacheLink);
		if(BAD_STATUS_CODES.includes(res?.status)) {
			await cache.delete(cacheLink);
		} else if(res) {
			prevCache?.delete(cacheLink);
			return res;
		}
		if(changedFiles.has(filename)) {
			prevCache?.delete(cacheLink);
		} else {
			let prevRes = await prevCache?.match(cacheLink);
			if(prevRes) {
				prevCache.delete(cacheLink);
				if(!BAD_STATUS_CODES.includes(prevRes.status)) {
					await cache.put(cacheLink, prevRes.clone());
					return prevRes;
				}
			}
		}
		res = await retrieve(fullUrl);
		let fetchAttempsLeft = 5;
		const fetchRetryTimeout = 1000;
		while(BAD_STATUS_CODES.includes(res.status) && fetchAttempsLeft--) {
			console.debug(`Encountered bad HTTP status ${res.status} from ${fullUrl}, trying again in ${fetchRetryTimeout}ms`);
			await sleep(fetchRetryTimeout);
			res = await retrieve(fullUrl);
		}
		if(BAD_STATUS_CODES.includes(res.status)) {
			console.error(`Couldn't avoid getting bad HTTP status code ${res.status} for ${fullUrl}`);
		} else {
			await cache.put(cacheLink, res.clone());
		}
		return res;
	}
}

/**
 * Sorts strings of versions, lowest to highest.
 * @param {string[]} versions
 * @returns {string[]}
 */
function sortVersions(versions) {
	let versionsAndParsed = versions.map(v => [v, Array.from(v.matchAll(/\d+/g)).map(m => +m[0])]);
	versionsAndParsed.sort(([, a], [, b]) => Array(max(a.length, b.length)).fill().map((_, i) => (a[i] ?? 0) - (b[i] ?? 0)).find(d => d) || 0);
	return versionsAndParsed.map(([ver]) => ver);
}

/**
 * Actually load a file, for when it's not found in cache.
 * @param {string} url
 * @returns {Promise<Response>}
 */
async function retrieve(url) {
	const maxFetchAttempts = 3;
	const fetchRetryTimeout = 500; // ms
	let lastError;
	for(let i = 0; i < maxFetchAttempts; i++) {
		try {
			return await fetch(url);
		} catch(e) {
			if(navigator.onLine && e instanceof TypeError && e.message == "Failed to fetch") { // random Chrome issue when fetching many images at the same time. observed when fetching 1600 images at the same time.
				console.debug(`Failed to fetch resource at ${url}, trying again in ${fetchRetryTimeout}ms`);
				lastError = e;
				await sleep(fetchRetryTimeout);
			} else {
				throw e;
			}
		}
	}
	console.error(`Failed to fetch resource at ${url} after ${maxFetchAttempts} attempts...`);
	throw lastError;
}