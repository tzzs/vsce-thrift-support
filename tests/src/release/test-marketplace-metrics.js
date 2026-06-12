const assert = require('assert');

const metrics = require('../../../scripts/marketplace-metrics.js');

describe('marketplace metrics script', () => {
    it('normalizes Visual Studio Marketplace and Open VSX adoption data', async () => {
        const calls = [];
        const fetchImpl = async (url, options = {}) => {
            calls.push({url, options});
            if (url.includes('marketplace.visualstudio.com')) {
                return jsonResponse({
                    results: [{
                        extensions: [{
                            versions: [{version: '3.1.0'}],
                            statistics: [
                                {statisticName: 'install', value: 1234},
                                {statisticName: 'ratingcount', value: 17}
                            ]
                        }]
                    }]
                });
            }

            return jsonResponse({
                version: '3.1.0',
                downloads: 456
            });
        };

        const result = await metrics.fetchMarketplaceMetrics({fetchImpl});

        assert.strictEqual(calls.length, 2);
        assert.strictEqual(calls[0].options.method, 'POST');
        assert.deepStrictEqual(result, {
            visualStudioMarketplace: {
                version: '3.1.0',
                installs: 1234,
                ratingCount: 17
            },
            openVsx: {
                version: '3.1.0',
                downloads: 456
            }
        });
    });

    it('raises a clear error when a metrics endpoint fails', async () => {
        const fetchImpl = async () => ({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            text: async () => 'temporarily unavailable'
        });

        await assert.rejects(
            () => metrics.fetchMarketplaceMetrics({fetchImpl}),
            /Visual Studio Marketplace request failed: 503 Service Unavailable/
        );
    });

    it('raises a clear error when Marketplace data is missing the extension', () => {
        assert.throws(
            () => metrics.normalizeVisualStudioMarketplace({results: [{extensions: []}]}),
            /Visual Studio Marketplace response did not contain tanzz.thrift-support/
        );
    });
});

function jsonResponse(payload) {
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => payload
    };
}
