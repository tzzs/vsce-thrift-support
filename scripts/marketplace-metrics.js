#!/usr/bin/env node

const VISUAL_STUDIO_MARKETPLACE_URL = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
const OPEN_VSX_URL = 'https://open-vsx.org/api/tanzz/thrift-support';

function readStatistic(extension, name) {
    const wanted = name.toLowerCase();
    const statistic = (extension.statistics || []).find((entry) => {
        return String(entry.statisticName || '').toLowerCase() === wanted;
    });

    return statistic ? Number(statistic.value || 0) : 0;
}

function normalizeVisualStudioMarketplace(payload) {
    const extension = payload?.results?.[0]?.extensions?.[0];
    if (!extension) {
        throw new Error('Visual Studio Marketplace response did not contain tanzz.thrift-support');
    }

    return {
        version: extension.versions?.[0]?.version || '',
        installs: readStatistic(extension, 'install'),
        ratingCount: readStatistic(extension, 'ratingcount')
    };
}

function normalizeOpenVsx(payload) {
    return {
        version: payload.version || '',
        downloads: Number(payload.downloads ?? payload.downloadCount ?? 0)
    };
}

async function readJsonResponse(response, label) {
    if (!response.ok) {
        throw new Error(`${label} request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

async function fetchMarketplaceMetrics(options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;

    if (typeof fetchImpl !== 'function') {
        throw new Error('global fetch is unavailable; run this script with Node.js 18 or newer.');
    }

    const marketplaceResponse = await fetchImpl(VISUAL_STUDIO_MARKETPLACE_URL, {
        method: 'POST',
        headers: {
            Accept: 'application/json;api-version=7.2-preview.1',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            filters: [{
                criteria: [
                    {filterType: 7, value: 'tanzz.thrift-support'}
                ]
            }],
            flags: 103
        })
    });
    const openVsxResponse = await fetchImpl(OPEN_VSX_URL, {
        headers: {
            Accept: 'application/json'
        }
    });

    const marketplacePayload = await readJsonResponse(marketplaceResponse, 'Visual Studio Marketplace');
    const openVsxPayload = await readJsonResponse(openVsxResponse, 'Open VSX');

    return {
        visualStudioMarketplace: normalizeVisualStudioMarketplace(marketplacePayload),
        openVsx: normalizeOpenVsx(openVsxPayload)
    };
}

async function runFromCli() {
    try {
        const result = await fetchMarketplaceMetrics();
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}

if (require.main === module) {
    runFromCli();
}

module.exports = {
    OPEN_VSX_URL,
    VISUAL_STUDIO_MARKETPLACE_URL,
    fetchMarketplaceMetrics,
    normalizeOpenVsx,
    normalizeVisualStudioMarketplace,
    runFromCli
};
