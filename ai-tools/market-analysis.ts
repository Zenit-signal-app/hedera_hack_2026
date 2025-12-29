import { tool } from 'ai';
import api from '@/axios/axiosInstance';
import axios from 'axios';
import { z } from 'zod';

const marketAnalysisSchema = z.object({
    baseAsset: z.string().describe('The symbol of base asset token on Cardano blockchain (e.g., "USDM", "MIN" or any other token symbol). Usually the first token symbol in the pair. If there is one symbol acquired, use the symbol as the base asset.'),
    quoteAsset: z.string().describe('The symbol of quote asset token on Cardano blockchain (e.g., "USDT", "ADA" or any other token symbol). Usually the second token symbol in the pair. If there is one symbol acquired, use ADA as the quote asset. If the base asset is ADA, use USDT as the quote asset.'),
    limit: z.number().optional().default(10).describe('Number of data points to retrieve (default: 10)'),
});

export const marketAnalysisTool = tool({
    description: 'Get the daily market data for a given token',
    parameters: marketAnalysisSchema,
    execute: async function ({ baseAsset, quoteAsset, limit = 10 }) {
        console.log('----- Trigger market analysis -----');
        console.log({ baseAsset, quoteAsset, limit });

        if (baseAsset === 'ADA') {
            const args = { limit };
            return adaAnalysis(args);
        }
        
        try {
            const response = await api.get(`/market/daily?symbol=${baseAsset}&limit=${limit}`);
            const data = await response.data;
            
            // Transform data: rename volumn to quote_asset in each object
            const transformedData = Array.isArray(data) 
                ? data.map((item: any) => {
                    if ('volumn' in item) {
                        const { volumn, ...rest } = item;
                        return { ...rest, quote_asset: volumn };
                    }
                    return item;
                })
                : data;
            
            // Create a human-readable content message for the AI
            const content = `Market data for ${baseAsset}/${quoteAsset} has been retrieved. Use this data and follow system prompt to provide analysis and insights.`;
            
            return {
                success: true,
                content,
                data: transformedData,
                baseAsset,
                quoteAsset,
            };
        } catch (error) {
            const content = `Unexpected error fetching market data for ${baseAsset}/${quoteAsset}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.log(content);
            return { 
                success: false, 
                content,
                baseAsset,
                quoteAsset,
            };
        }
    },
});

const adaAnalysis = async ({ limit = 10 }) => {
    const baseURL = process.env.NEXT_VISTIA_API;
    const baseAsset = 'ADA';
    const quoteAsset = 'USDT';
    if (!baseURL) {
        throw new Error('NEXT_VISTIA_API environment variable is not configured');
    }
    try {
        const url = `${baseURL}api/v2_2/market/daily?symbol=${baseAsset}${quoteAsset}&limit=${limit}`;
        const response = await axios.get(url);
        const data = await response.data;
            
        // Create a human-readable content message for the AI
        const content = `Market data for ${baseAsset}/${quoteAsset} has been retrieved. Use this data and follow system prompt to provide analysis and insights.`;
            
        return {
            success: true,
            content,
            data,
            baseAsset,
            quoteAsset,
        };
    } catch (error) {
        const content = `Unexpected error fetching market data for ${baseAsset}/${quoteAsset}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.log(content);
        return { 
            success: false, 
            content,
            baseAsset,
            quoteAsset,
        };
    }
}

const getSupportedTokensSchema = z.object({
    query: z.string().optional().describe('Optional search query to filter tokens by name or symbol'),
    page: z.number().optional().default(1).describe('Page number for pagination (default: 1)'),
    page_size: z.number().optional().default(50).describe('Number of tokens per page (default: 50)'),
});

export const getSupportedTokensTool = tool({
    description: 'Get the list of supported tokens on Seerbot Exchange. Use this to answer questions about what tokens are available on the platform.',
    parameters: getSupportedTokensSchema,
    execute: async function ({ query, page = 1, page_size = 50 }) {
        console.log('----- Trigger get supported tokens -----');
        console.log({ query, page, page_size });
        
        try {
            const params: Record<string, string | number> = {
                page,
                page_size,
            };
            
            if (query) {
                params.query = query;
            }
            
            const response = await api.get('/analysis/tokens', { params });
            const responseData = await response.data;
            
            // Extract only id, name, and symbol from each token
            const tokens = (responseData.tokens || []).map((token: any) => ({
                id: token.id || '',
                name: token.name || '',
                symbol: token.symbol || '',
            }));
            
            // Create a human-readable content message
            const totalTokens = responseData.total || 0;
            const currentPage = responseData.page || page;
            const tokensCount = tokens.length;
            
            let content = `Found ${totalTokens} supported token${totalTokens !== 1 ? 's' : ''} on Seerbot Exchange`;
            if (query) {
                content += ` matching "${query}"`;
            }
            content += `. Showing ${tokensCount} token${tokensCount !== 1 ? 's' : ''} on page ${currentPage}.`;
            content += ` Use this data and follow system prompt to inform users about available tokens on the platform.`;
            
            return {
                success: true,
                content,
                data: {
                    total: totalTokens,
                    page: currentPage,
                    tokens,
                },
            };
        } catch (error) {
            const content = `Unexpected error fetching supported tokens: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.log(content);
            return { 
                success: false, 
                content 
            };
        }
    },
});